const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const mysql = require('mysql2/promise');

// 1. Initialize DynamoDB (It will use your AWS CLI credentials)
const client = new DynamoDBClient({ region: "ap-south-1" }); // Change to your region
const ddbDocClient = DynamoDBDocumentClient.from(client);

const rdsConfig = {
    host: process.env.DB_HOST, // Paste from RDS Console
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME // Make sure you created a schema/database in Workbench
};

exports.handler = async (event) => {
    console.log("Inside function..")
    // 1. Add a check to see if 'Records' exists
    if (!event.Records || event.Records.length === 0) {
        console.error("No Records found in the event!");
        return { statusCode: 400, body: "Invalid Event" };
    }

    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing: ${key}`);

    // 2. Prepare the data for DynamoDB
    const params = {
        TableName: "RoutingLogs",
        Item: {
            logId: Date.now().toString(), // Using timestamp as the ID
            fileName: key,
            bucketName: bucket,
            timestamp: new Date().toISOString(),
            status: "PROCESSED"
        }
    };

    try {
        // 3. Save to the real AWS DynamoDB
        await ddbDocClient.send(new PutCommand(params));
        console.log("Successfully saved log to DynamoDB!");

        const connection = await mysql.createConnection(rdsConfig);
        console.log("Connected to MySQL RDS!");

        // 3. Insert a record
        const sql = "INSERT INTO logs (file_name, bucket, route) VALUES (?, ?, ?)";
        const [result] = await connection.execute(sql, [key, bucket, key.split('/')[0]]);
        console.log("MySQL Result:", result);

        await connection.commit(); // Force the save
        await connection.end();
        console.log("Successfully saved log to MySQL RDS!");
    } catch (err) {
        console.error("Failed to save to DynamoDB:", err);
    }

    return { statusCode: 200 };
};