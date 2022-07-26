const fs = require('fs');
const { ObjectID } = require('bson');
const { CosmWasmClient } = require('cudosjs');
const extract = require('extract-zip');

const config = require('./config');
const  { connectDB, setVerificationResult, removeItemFromQueue } = require('./db');
const compileSource = require('./sourceCompiler');
const verifyContractHash = require('./contractVerifier');
const { getSourceSavePath, cleanup } = require('./files');


let nodeClient;
// TODO: Refactor and move these into db.js
let sourcesBucket, verificationResultsCollection;
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
    verificationResultsCollection = dbInfo.verificationResultsCollection;
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
            console.log('nothing in queue');
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
        
        let crateName;

        if ('crateName' in entries[0]['metadata']) {
            crateName = entries[0]['metadata']['crateName'];
        }

        const binaryPath = compileSource(extractPath, entries[0]['metadata']['optimizer'], crateName);

        if (await verifyContractHash(nodeClient, binaryPath, entries[0]['metadata']['address']) == false) {
            throw `compiled binary hash for ${entries[0]['metadata']['address']} is not equal to deployed contract hash`;
        }

        await setVerificationResult(sourceID, { verified: true });

        console.log(`Successfully verified ${sourceID}`);

    } catch (e) {
        console.error(`processing failed: ${e}`);

        try {
            await setVerificationResult(sourceID, { error: JSON.stringify(e) });
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