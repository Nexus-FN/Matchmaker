const apiKeys = [
    "oif89sdwekljnjvdfgß0fdgpoijiqwebh" //Smashed Keyboard lol
];
function verifyApiKey(apiKey) {
    if (!apiKeys.includes(apiKey))
        return false;
    return true;
}
export default verifyApiKey;
//# sourceMappingURL=verifyapi.js.map