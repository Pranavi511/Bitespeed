import { dbAll, dbRun, Contact } from "./db";

export async function processIdentityReconciliation(email?: string | null, phoneNumber?: string | number | null) {
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
        const result = await dbRun(
            `INSERT INTO Contact (email, phoneNumber, linkPrecedence) VALUES (?, ?, 'primary')`,
            [normalizedEmail, normalizedPhone]
        );

        return {
            contact: {
                primaryContatctId: result.lastID,
                phoneNumbers: [normalizedPhone].filter(Boolean) as string[],
                secondaryContactIds: []
            }
        };
    }

    const primaryIds = new Set<number>();
    for (const c of matchingContacts) {
        if (c.linkPrecedence === 'primary') {
            primaryIds.add(c.id);
        } else if (c.linkedId) {
            primaryIds.add(c.linkedId);
        } else {
            primaryIds.add(c.id); 
        }
    }

    const primaryContacts = await dbAll(
        `SELECT * FROM Contact WHERE id IN (${Array.from(primaryIds).join(',')})`
    ) as Contact[];

    primaryContacts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const oldestPrimary = primaryContacts[0] as Contact;
    if (!oldestPrimary) throw new Error("Data integrity error: primary contact not found.");
    const secondaryPrimaries = primaryContacts.slice(1);

    if (secondaryPrimaries.length > 0) {
        const idsToUpdate = secondaryPrimaries.map(p => p.id);

        await dbRun(
            `UPDATE Contact SET linkPrecedence = 'secondary', linkedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id IN (${idsToUpdate.join(',')})`,
            [oldestPrimary.id]
        );

        await dbRun(
            `UPDATE Contact SET linkedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE linkedId IN (${idsToUpdate.join(',')})`,
            [oldestPrimary.id]
        );
    }

    const fullCluster = await dbAll(
        `SELECT * FROM Contact WHERE id = ? OR linkedId = ? ORDER BY createdAt ASC`,
        [oldestPrimary.id, oldestPrimary.id]
    ) as Contact[];

    const clusterEmails = fullCluster.map(c => c.email).filter(e => e !== null);
    const clusterPhones = fullCluster.map(c => c.phoneNumber).filter(p => p !== null);

    const isNewEmail = normalizedEmail && !clusterEmails.includes(normalizedEmail);
    const isNewPhone = normalizedPhone && !clusterPhones.includes(normalizedPhone);

    if (isNewEmail || isNewPhone) {
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

    const emailsSet = new Set<string>();
    const phonesSet = new Set<string>();

    const primaryContact = (fullCluster.find(c => c.id === oldestPrimary.id) || oldestPrimary) as Contact;

    if (primaryContact.email) emailsSet.add(primaryContact.email);
    if (primaryContact.phoneNumber) phonesSet.add(primaryContact.phoneNumber);

    for (const c of fullCluster) {
        if (c.email) emailsSet.add(c.email);
        if (c.phoneNumber) phonesSet.add(c.phoneNumber);
    }

    const secondaryContactIds = fullCluster
        .filter(c => c.id !== oldestPrimary.id)
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