const sha256File = require('sha256-file');


module.exports = async (queryClient, binaryPath, address) => {
    let binaryHash, contract, codeDetails;

    try {
        binaryHash = sha256File(binaryPath);
    } catch (e) {
        throw `failed to generate hash of binary ${binaryPath}`;
    }

    try {
        contract = await queryClient.getContract(address);
        codeDetails = await queryClient.getCodeDetails(contract.codeId);
    } catch (e) {
        throw `failed to query contract ${address} hash with error: ${e}`;``
    }

    // Buffer.from(code.codeInfo.dataHash).toString('hex');

    if (binaryHash != codeDetails.checksum) {
        console.error(`binary hash ${binaryHash} not equal to deployed contract hash ${codeDetails.checksum}`);
        return false;
    }

    return true;
}
