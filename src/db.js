const { MongoClient, GridFSBucket } = require('mongodb');
const mongoDbQueue = require('@openwar/mongodb-queue');


let verificationQueue, verificationResultsCollection;
let parsingQueue;
let sourcesCollection;


module.exports.setVerificationResult = async (sourceID, result) => {
    try {
        await verificationResultsCollection.updateOne({ _id: sourceID.toString() }, { $set: result });
    } catch (e) {
        throw `failed setting result for ${sourceID} to ${result} with error: ${e}`;
    }
}

module.exports.updateSource = async (sourceID, result) => {
    try {
        await sourcesCollection.updateOne({ _id: sourceID }, { $set: result });
    } catch (e) {
        throw `failed updating source for ${sourceID} to ${result} with error: ${e}`;
    }
}

module.exports.removeItemFromQueue = async (sourceID, queueItem) => {
    try {
        // TODO: Remove item from queue only after X tries
        await verificationQueue.ack(queueItem.ack);
    } catch (e) {
        throw `failed to acknowledge ${sourceID} ${queueItem.ack}`;
    }
}

module.exports.addItemToParsingQueue = async (sourceID) => {
    try {
        await parsingQueue.add(sourceID);
    } catch (e) {
        throw `failed to add ${sourceID} to parsing queue`;
    }
}

module.exports.connectDB = async (dbName, sourcesBucketName, verificationResultsCollName) => {
    const client = await MongoClient.connect(process.env.MONGO_URI, {
        connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });

    const db = client.db(dbName);
    
    verificationQueue = mongoDbQueue(db, 'verification-queue', {
        visibility: process.env.QUEUE_ITEM_VISIBILITY, // 15mins
    });

    parsingQueue = mongoDbQueue(db, 'parsing-queue', {
        visibility: Number(process.env.QUEUE_ITEM_VISIBILITY),
    })

    verificationResultsCollection = db.collection(verificationResultsCollName);
    sourcesCollection = db.collection(sourcesBucketName + '.files');

    return {
        sourcesBucket: new GridFSBucket(db, {bucketName: sourcesBucketName}),
        verificationResultsCollection: verificationResultsCollection,
        verificationQueue: verificationQueue,
    };
}
