const fs = require('fs');
const { ObjectID } = require('bson');
const { CosmWasmClient } = require('cudosjs');
const extract = require('extract-zip');

const config = require('./config');
const {
    connectDB,
    setVerificationResult,
    removeItemFromQueue,
    addItemToParsingQueue,
    updateSource
} = require('./db');
const compileSource = require('./sourceCompiler');
const verifyContractHash = require('./contractVerifier');
const { getSourceSavePath, cleanup } = require('./files');

let nodeClient;
// TODO: Refactor and move these into db.js
let sourcesBucket;
let verificationQueue;
let isNodeConnected = false, isDBConnected = false;


config.verifyConfig();


CosmWasmClient.connect(process.env.NODE_RPC_URL).then(async (client) => {
    isNodeConnected = true;
    nodeClient = client;

    console.log('connected to node');
}).catch((reason) => {
    console.error('failed to connect node query client ', reason);
    throw reason;
});

connectDB('contracts_scan', 'sources', 'verification_results').then((dbInfo) => {
    sourcesBucket = dbInfo.sourcesBucket;
    verificationQueue = dbInfo.verificationQueue;

    isDBConnected = true;

    console.log('connected to database');

}).catch((reason) => {
    console.error('failed to connect to database ', reason);
    throw reason;
});

const workLoop = async () => {

    let extractPath, sourceID, queueItem;

    try {
        if (isNodeConnected === false) {
            console.log('node not connected');
            return;
        }

        if (isDBConnected === false) {
            console.log('db not connected');
            return;
        }

        if (await verificationQueue.size() == 0) {
            return;
        }

        queueItem = await verificationQueue.get();
        sourceID = new ObjectID(queueItem.payload);

        const cursor = await sourcesBucket.find({ _id: sourceID });
        const entries = await cursor.toArray();

        if (entries.length == 0) {
            throw `source ${sourceID} not found`;
        }

        const sourceSavePath = getSourceSavePath();

        await new Promise((resolve, reject) => {
            const stream = fs.createWriteStream(sourceSavePath);
            stream.on('finish', () => { resolve(); });
            stream.on('error', (e) => { reject(e); });

            const downloadStream = sourcesBucket.openDownloadStream(sourceID);
            downloadStream.on('error', (e) => { reject(e); });
            downloadStream.pipe(stream);
        });

        extractPath = sourceSavePath.replace('source.zip', '');

        await extract(sourceSavePath, { dir: extractPath });

        console.log(`extracted to ${extractPath}`);

        let metadata = entries[0]['metadata'];

        let crateName;

        if ('crateName' in metadata) {
            crateName = metadata['crateName'];
        }

        const binaryPath = compileSource(extractPath, metadata['optimizer'], crateName);

        try {
            const contract = await nodeClient.getContract(metadata['address']);
            metadata['codeID'] = contract.codeId;
        } catch (e) {
            throw `failed to query contract ${metadata['address']} hash with error: ${e}`;
        }

        if (await verifyContractHash(nodeClient, binaryPath, metadata['codeID']) == false) {
            throw `compiled binary hash for ${contractAddress} is not equal to deployed contract hash`;
        }

        await setVerificationResult(sourceID, { verified: true });

        console.log(`Successfully verified ${sourceID}`);

        await updateSource(sourceID, { metadata: metadata });
        console.log('Successfully added codeID to source metadata');
        
        await addItemToParsingQueue(sourceID);

        console.log(`Successfully added ${sourceID} to parsing queue.`);

    } catch (e) {
        console.error(`processing failed: ${e}`);

        let error = e;

        if (Array.isArray(error) || typeof error === 'object') {
            error = JSON.stringify(error);
        }

        try {
            await setVerificationResult(sourceID, { error: error });
        } catch (e) {
            console.error(e);
        }

    } finally {

        if (queueItem) {
            await removeItemFromQueue(sourceID, queueItem);
        }

        setTimeout(workLoop, Number(process.env.QUEUE_CHECK_INTERVAL));

        if (extractPath) {
            cleanup(extractPath);
        }
    }
}

setTimeout(workLoop, Number(process.env.QUEUE_CHECK_INTERVAL));