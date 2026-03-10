import { dbAll, dbRun, Contact } from "./db";

export async function processIdentityReconciliation(email?: string | null, phoneNumber?: string | number | null) {
    // Normalize inputs
    const normalizedEmail = email ? email.toString().trim() : null;
    const normalizedPhone = phoneNumber ? phoneNumber.toString().trim() : null;

    if (!normalizedEmail && !normalizedPhone) {
        throw new Error("Either email or phoneNumber must be provided");
    }

    const params: string[] = [];
    const conditions: string[] = [];

    if (normalizedEmail) {
        conditions.push("email = ?");
        params.push(normalizedEmail);
    }
    if (normalizedPhone) {
        conditions.push("phoneNumber = ?");
        params.push(normalizedPhone);
    }

    const query = `SELECT * FROM Contact WHERE ${conditions.join(" OR ")}`;
    const matchingContacts = await dbAll(query, params) as Contact[];

    if (matchingContacts.length === 0) {
        // No matches mean entirely new primary contact
        const result = await dbRun(
            `INSERT INTO Contact (email, phoneNumber, linkPrecedence) VALUES (?, ?, 'primary')`,
            [normalizedEmail, normalizedPhone]
        );

        return {
            contact: {
                primaryContatctId: result.lastID, // Intentionally spelled with extra 't' as per requirements
                emails: [normalizedEmail].filter(Boolean) as string[],
                phoneNumbers: [normalizedPhone].filter(Boolean) as string[],
                secondaryContactIds: []
            }
        };
    }

    // Matches found. Find the true primary contacts out of these
    const primaryIds = new Set<number>();
    for (const c of matchingContacts) {
        if (c.linkPrecedence === 'primary') {
            primaryIds.add(c.id);
        } else if (c.linkedId) {
            primaryIds.add(c.linkedId);
        } else {
            primaryIds.add(c.id); // Fallback for data resilience
        }
    }

    // Fetch true primary contacts to see if there's more than one
    const primaryContacts = await dbAll(
        `SELECT * FROM Contact WHERE id IN (${Array.from(primaryIds).join(',')})`
    ) as Contact[];

    // Sort by earliest creation date to find the "oldest" primary
    primaryContacts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const oldestPrimary = primaryContacts[0];
    const secondaryPrimaries = primaryContacts.slice(1);

    // Convert newer primaries into secondaries of the oldest
    if (secondaryPrimaries.length > 0) {
        const idsToUpdate = secondaryPrimaries.map(p => p.id);

        // Update the newer primaries directly
        await dbRun(
            `UPDATE Contact SET linkPrecedence = 'secondary', linkedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id IN (${idsToUpdate.join(',')})`,
            [oldestPrimary.id]
        );

        // Update the secondary contacts that linked to those newer primaries
        await dbRun(
            `UPDATE Contact SET linkedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE linkedId IN (${idsToUpdate.join(',')})`,
            [oldestPrimary.id]
        );
    }

    // Fetch the definitive cluster of all linked contacts under oldestPrimary
    const fullCluster = await dbAll(
        `SELECT * FROM Contact WHERE id = ? OR linkedId = ? ORDER BY createdAt ASC`,
        [oldestPrimary.id, oldestPrimary.id]
    ) as Contact[];

    // Determine if incoming payload has novel info
    const clusterEmails = fullCluster.map(c => c.email).filter(e => e !== null);
    const clusterPhones = fullCluster.map(c => c.phoneNumber).filter(p => p !== null);

    const isNewEmail = normalizedEmail && !clusterEmails.includes(normalizedEmail);
    const isNewPhone = normalizedPhone && !clusterPhones.includes(normalizedPhone);

    if (isNewEmail || isNewPhone) {
        // Create new secondary contact
        const result = await dbRun(
            `INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence) VALUES (?, ?, ?, 'secondary')`,
            [normalizedEmail, normalizedPhone, oldestPrimary.id]
        );

        fullCluster.push({
            id: result.lastID,
            email: normalizedEmail,
            phoneNumber: normalizedPhone,
            linkedId: oldestPrimary.id,
            linkPrecedence: 'secondary',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        });
    }

    // Format array responses keeping primary first, ordered chronologically 
    const emailsSet = new Set<string>();
    const phonesSet = new Set<string>();

    // ensure oldest (primary) contact values added first
    const primaryContact = fullCluster.find(c => c.id === oldestPrimary.id) || oldestPrimary;

    if (primaryContact.email) emailsSet.add(primaryContact.email);
    if (primaryContact.phoneNumber) phonesSet.add(primaryContact.phoneNumber);

    for (const c of fullCluster) {
        if (c.email) emailsSet.add(c.email);
        if (c.phoneNumber) phonesSet.add(c.phoneNumber);
    }

    const secondaryContactIds = fullCluster
        .filter(c => c.id !== oldestPrimary.id) // all but primary are secondary
        .map(c => c.id);

    return {
        contact: {
            primaryContatctId: oldestPrimary.id,
            emails: Array.from(emailsSet),
            phoneNumbers: Array.from(phonesSet),
            secondaryContactIds
        }
    };
}