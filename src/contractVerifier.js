const sha256File = require('sha256-file');


module.exports = async (queryClient, binaryPath, codeID) => {
    let binaryHash, contract, codeDetails;

    try {
        binaryHash = sha256File(binaryPath);
    } catch (e) {
        throw `failed to generate hash of binary ${binaryPath}`;
    }

    try {
        codeDetails = await queryClient.getCodeDetails(codeID);
    } catch (e) {
        throw `failed to query code details for codeID ${codeID} with error: ${e}`;``
    }

    if (binaryHash != codeDetails.checksum) {
        console.error(`binary hash ${binaryHash} not equal to deployed contract hash ${codeDetails.checksum}`);
        return false;
    }

    return true;
}
