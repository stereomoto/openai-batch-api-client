#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const path = require('path');
const InputHandler = require('./input-handler');
const BatchRequestGenerator = require('./batch-request-generator');
const FileApiClient = require('./file-api-client');
const BatchApiClient = require('./batch-api-client');

const program = new Command();

// Initialize clients
const inputHandler = new InputHandler();
const fileApiClient = new FileApiClient(process.env.OPENAI_API_KEY);
const batchApiClient = new BatchApiClient(process.env.OPENAI_API_KEY);

program
    .name('batch-processor')
    .description('CLI tool for processing data through OpenAI Batch API')
    .version('1.0.0');

program
    .command('prepare')
    .description('Prepare JSONL file for batch processing')
    .option('-i, --input <path>', 'Input CSV file path', 'input/input.csv')
    .option('-p, --prompt <path>', 'Prompt template file path', 'input/prompt.txt')
    .option('-c, --config <path>', 'Configuration file path', 'input/config.json')
    .option('--id-column <column>', 'CSV column to use as custom_id')
    .option('--id-prefix <prefix>', 'Prefix for generated custom_ids')
    .action(async (options) => {
        try {
            const csvData = await inputHandler.readCSV(options.input);
            const promptTemplate = await inputHandler.readPromptTemplate(options.prompt);
            const config = await inputHandler.readConfig(options.config);
            
            const generator = new BatchRequestGenerator(config);
            const outputPath = path.join('temp', 'batch_request.jsonl');
            
            const result = await generator.generateBatchRequest(
                csvData,
                promptTemplate,
                outputPath,
                options.idColumn,
                options.idPrefix
            );
            
            console.log(`Generated batch request file at ${result.filePath}`);
            console.log(`Total requests: ${result.requestCount}`);
        } catch (error) {
            console.error('Error preparing batch request:', error.message);
            process.exit(1);
        }
    });

program
    .command('upload')
    .description('Upload JSONL file to OpenAI')
    .option('-f, --file <path>', 'JSONL file path', 'temp/batch_request.jsonl')
    .action(async (options) => {
        try {
            const response = await fileApiClient.uploadFile(options.file);
            console.log('File uploaded successfully');
            console.log('File ID:', response.id);
        } catch (error) {
            console.error('Error uploading file:', error.message);
            process.exit(1);
        }
    });

program
    .command('submit')
    .description('Submit batch job')
    .argument('<fileId>', 'File ID from upload step')
    .action(async (fileId) => {
        try {
            const response = await batchApiClient.createBatchJob(fileId);
            console.log('Batch job created successfully');
            console.log('Batch ID:', response.id);
        } catch (error) {
            console.error('Error submitting batch job:', error.message);
            process.exit(1);
        }
    });

program
    .command('check')
    .description('Check batch job status')
    .argument('<batchId>', 'Batch job ID')
    .action(async (batchId) => {
        try {
            const status = await batchApiClient.getBatchJobStatus(batchId);
            console.log('Batch job status:', status.status);
            console.log('Progress:', status);
        } catch (error) {
            console.error('Error checking batch job status:', error.message);
            process.exit(1);
        }
    });

program
    .command('download')
    .description('Download batch job results')
    .argument('<batchId>', 'Batch job ID')
    .option('-o, --output <path>', 'Output directory', 'results')
    .action(async (batchId, options) => {
        try {
            const status = await batchApiClient.getBatchJobStatus(batchId);
            if (status.status !== 'completed') {
                console.error('Batch job not completed');
                process.exit(1);
            }

            const outputPath = path.join(options.output, `batch_${batchId}_output.jsonl`);
            await fileApiClient.downloadFile(status.output_file_id, outputPath);
            console.log(`Results downloaded to ${outputPath}`);

            if (status.error_file_id) {
                const errorPath = path.join(options.output, `batch_${batchId}_errors.jsonl`);
                await fileApiClient.downloadFile(status.error_file_id, errorPath);
                console.log(`Errors downloaded to ${errorPath}`);
            }
        } catch (error) {
            console.error('Error downloading results:', error.message);
            process.exit(1);
        }
    });

program.parse(); 