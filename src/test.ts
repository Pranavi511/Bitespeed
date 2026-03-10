import { processIdentityReconciliation } from "./identify";
import { dbRun, db } from "./db";

async function runTests() {
    // Ensure DB is initialized before cleaning up
    await new Promise(resolve => setTimeout(resolve, 500));
    await dbRun("DELETE FROM Contact"); // clean state

    console.log("Test 1: New contact");
    let res = await processIdentityReconciliation("lorraine@hillvalley.edu", "123456");
    console.log(JSON.stringify(res, null, 2));

    console.log("Test 2: Existing phone, new email");
    res = await processIdentityReconciliation("mcfly@hillvalley.edu", "123456");
    console.log(JSON.stringify(res, null, 2));

    console.log("Test 3: Existing, no new info");
    res = await processIdentityReconciliation("mcfly@hillvalley.edu", null);
    console.log(JSON.stringify(res, null, 2));

    console.log("Test 4: Merging two primary contacts");
    // Setup two separate primaries
    await dbRun("DELETE FROM Contact");
    await processIdentityReconciliation("george@hillvalley.edu", "919191");
    await new Promise(resolve => setTimeout(resolve, 100)); // ensure different createdAt
    await processIdentityReconciliation("biffsucks@hillvalley.edu", "717171");

    // Merge them
    res = await processIdentityReconciliation("george@hillvalley.edu", "717171");
    console.log(JSON.stringify(res, null, 2));
}

runTests().catch(console.error);
