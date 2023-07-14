const apiKeys: string[] = [
    "oif89sdwekljnjvdfgß0fdgpoijiqwebh" //Smashed Keyboard lol
]

function verifyApiKey(apiKey: string): boolean {
    if(!apiKeys.includes(apiKey)) return false;
    return true;
}

export default verifyApiKey