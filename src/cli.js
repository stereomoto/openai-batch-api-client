#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const path = require('path');
const InputHandler = require('./input-handler');
const BatchRequestGenerator = require('./batch-request-generator');
const FileApiClient = require('./file-api-client');
const BatchApiClient = require('./batch-api-client');
const fs = require('fs');
const readline = require('readline');
const { parse } = require('json2csv');
const { globSync } = require('glob');

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
            const outputDir = path.join('temp');
            const baseFilename = 'batch_request'; // Base name for output files
            
            // Ensure the temp directory exists
            await fs.promises.mkdir(outputDir, { recursive: true });

            const result = await generator.generateBatchRequest(
                csvData,
                promptTemplate,
                outputDir,
                baseFilename,
                options.idColumn,
                options.idPrefix
            );
            
            console.log(`Generated ${result.filePaths.length} batch request file(s):`);
            result.filePaths.forEach(filePath => console.log(`  - ${filePath}`));
            console.log(`Total requests: ${result.requestCount}`);
        } catch (error) {
            console.error('Error preparing batch request:', error.message);
            process.exit(1);
        }
    });

program
    .command('upload')
    .description('Upload JSONL file(s) matching a pattern to OpenAI')
    .option('-f, --file <pattern>', 'JSONL file path pattern', 'temp/batch_request_part_*.jsonl')
    .action(async (options) => {
        try {
            const filePaths = globSync(options.file);

            if (filePaths.length === 0) {
                console.error(`Error: No files found matching pattern: ${options.file}`);
                process.exit(1);
            }

            console.log(`Found ${filePaths.length} file(s) to upload:`);
            filePaths.forEach(fp => console.log(`  - ${fp}`));

            const uploadResults = [];
            for (const filePath of filePaths) {
                try {
                    console.log(`\nUploading ${filePath}...`);
                    const response = await fileApiClient.uploadFile(filePath);
                    console.log(`  File uploaded successfully`);
                    console.log(`  File ID: ${response.id}`);
                    uploadResults.push({ filePath: filePath, fileId: response.id, status: 'success' });
                } catch (error) {
                    console.error(`  Error uploading ${filePath}:`, error.message);
                    uploadResults.push({ filePath: filePath, fileId: null, status: 'error', error: error.message });
                }
            }

            console.log('\n--- Upload Summary ---');
            const successfulUploads = uploadResults.filter(r => r.status === 'success');
            const failedUploads = uploadResults.filter(r => r.status === 'error');

            console.log(`Successfully uploaded ${successfulUploads.length} file(s):`);
            successfulUploads.forEach(r => console.log(`  - ${r.filePath} -> File ID: ${r.fileId}`));

            // Save successful uploads to a file
            if (successfulUploads.length > 0) {
                const uploadsFilePath = path.join('temp', 'uploaded_files.json');
                try {
                    await fs.promises.mkdir(path.dirname(uploadsFilePath), { recursive: true });
                    await fs.promises.writeFile(uploadsFilePath, JSON.stringify(successfulUploads, null, 2), 'utf-8');
                    console.log(`\nSuccessfully uploaded file IDs saved to: ${uploadsFilePath}`);
                } catch (writeError) {
                    console.error(`\nError saving uploaded file IDs to ${uploadsFilePath}:`, writeError.message);
                    // Decide if we should exit here or just warn
                }
            }

            if (failedUploads.length > 0) {
                console.warn(`\nFailed to upload ${failedUploads.length} file(s):`);
                failedUploads.forEach(r => console.warn(`  - ${r.filePath}: ${r.error}`));
                process.exit(1); // Exit with error if any upload failed
            }

        } catch (error) {
            console.error('An unexpected error occurred during upload:', error.message);
            process.exit(1);
        }
    });

program
    .command('submit')
    .description('Submit batch jobs for uploaded files')
    .option('-u, --uploads-file <path>', 'JSON file containing uploaded file IDs', 'temp/uploaded_files.json')
    .action(async (options) => {
        const uploadsFilePath = options.uploadsFile;
        let uploadedFiles = [];

        // Read the uploaded files JSON
        try {
            if (!fs.existsSync(uploadsFilePath)) {
                 console.error(`Error: Uploads file not found at ${uploadsFilePath}`);
                 console.error(`Please run the 'upload' command first or specify the correct path.`);
                 process.exit(1);
            }
            const fileContent = await fs.promises.readFile(uploadsFilePath, 'utf-8');
            uploadedFiles = JSON.parse(fileContent);
            if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
                console.error(`Error: No valid file data found in ${uploadsFilePath}. Expected a non-empty array.`);
                process.exit(1);
            }
            // Optional: Validate structure further if needed (e.g., check for fileId)

        } catch (error) {
            console.error(`Error reading or parsing uploads file ${uploadsFilePath}:`, error.message);
            process.exit(1);
        }
        
        console.log(`Found ${uploadedFiles.length} file(s) to submit from ${uploadsFilePath}:`);
        const submissionResults = [];

        for (const uploadInfo of uploadedFiles) {
             if (!uploadInfo.fileId) {
                 console.warn(`Skipping entry with missing fileId: ${JSON.stringify(uploadInfo)}`);
                 submissionResults.push({ ...uploadInfo, batchId: null, status: 'skipped', error: 'Missing fileId' });
                 continue;
             }
             
             try {
                console.log(`\nSubmitting batch job for File ID: ${uploadInfo.fileId} (from ${uploadInfo.filePath})...`);
                const response = await batchApiClient.createBatchJob(uploadInfo.fileId);
                console.log(`  Batch job created successfully`);
                console.log(`  Batch ID: ${response.id}`);
                submissionResults.push({ ...uploadInfo, batchId: response.id, status: 'success' });
            } catch (error) {
                console.error(`  Error submitting batch job for File ID ${uploadInfo.fileId}:`, error.message);
                 submissionResults.push({ ...uploadInfo, batchId: null, status: 'error', error: error.message });
            }
        }

        console.log('\n--- Submission Summary ---');
        const successfulSubmissions = submissionResults.filter(r => r.status === 'success');
        const failedSubmissions = submissionResults.filter(r => r.status === 'error' || r.status === 'skipped');

        console.log(`Successfully submitted ${successfulSubmissions.length} batch job(s):`);
        successfulSubmissions.forEach(r => console.log(`  - File: ${r.filePath} (ID: ${r.fileId}) -> Batch ID: ${r.batchId}`));

        // Save submission results (including batch IDs) to a file
        if (submissionResults.length > 0) {
            const submissionsFilePath = path.join('temp', 'submitted_batches.json');
            try {
                await fs.promises.mkdir(path.dirname(submissionsFilePath), { recursive: true });
                await fs.promises.writeFile(submissionsFilePath, JSON.stringify(submissionResults, null, 2), 'utf-8');
                console.log(`\nSubmission details saved to: ${submissionsFilePath}`);
            } catch (writeError) {
                console.error(`\nError saving submission details to ${submissionsFilePath}:`, writeError.message);
            }
        }

        if (failedSubmissions.length > 0) {
            console.warn(`\n${failedSubmissions.length} job(s) were not submitted successfully:`);
            failedSubmissions.forEach(r => console.warn(`  - File: ${r.filePath} (ID: ${r.fileId || 'N/A'}) -> Status: ${r.status}, Error: ${r.error || 'N/A'}`));
            // Decide if we should exit with error if any submission failed
            // process.exit(1); 
        }
    });

program
    .command('check')
    .description('Check batch job status for one or multiple jobs')
    .option('-s, --submissions-file <path>', 'JSON file with submission details', 'temp/submitted_batches.json')
    .option('-b, --batch-id <id>', 'Check status for a specific Batch ID')
    .action(async (options) => {
        let batchJobsToCheck = [];

        if (options.batchId) {
            // Check a single specified batch ID
            console.log(`Checking status for specific Batch ID: ${options.batchId}`);
            batchJobsToCheck.push({ batchId: options.batchId, source: 'option' });
        } else {
            // Read batch IDs from the submissions file
            const submissionsFilePath = options.submissionsFile;
            try {
                if (!fs.existsSync(submissionsFilePath)) {
                    console.error(`Error: Submissions file not found at ${submissionsFilePath}`);
                    console.error(`Please run 'submit' first or specify a Batch ID using --batch-id.`);
                    process.exit(1);
                }
                const fileContent = await fs.promises.readFile(submissionsFilePath, 'utf-8');
                const submissionResults = JSON.parse(fileContent);
                
                if (!Array.isArray(submissionResults)) {
                     console.error(`Error: Invalid format in ${submissionsFilePath}. Expected an array.`);
                     process.exit(1);
                }

                batchJobsToCheck = submissionResults
                    .filter(r => r.status === 'success' && r.batchId)
                    .map(r => ({ batchId: r.batchId, filePath: r.filePath, source: 'file' }));

                if (batchJobsToCheck.length === 0) {
                    console.log(`No successfully submitted batch jobs found in ${submissionsFilePath} to check.`);
                    process.exit(0);
                }
                console.log(`Found ${batchJobsToCheck.length} batch job(s) to check from ${submissionsFilePath}:`);

            } catch (error) {
                console.error(`Error reading or parsing submissions file ${submissionsFilePath}:`, error.message);
                process.exit(1);
            }
        }

        // Check status for each job
        console.log('\n--- Batch Job Statuses ---');
        const statusResults = [];
        let allCompleted = true;
        let anyFailed = false;

        for (const jobInfo of batchJobsToCheck) {
            try {
                const status = await batchApiClient.getBatchJobStatus(jobInfo.batchId);
                const statusLine = `Batch ID: ${jobInfo.batchId} -> Status: ${status.status}`; 
                console.log(statusLine + (jobInfo.filePath ? ` (from ${jobInfo.filePath})` : ''));
                // Optionally log more details from status object
                // console.log('  Progress:', status);
                statusResults.push({ ...jobInfo, status: status.status, details: status });
                if (status.status !== 'completed') allCompleted = false;
                if (['failed', 'expired', 'cancelled'].includes(status.status)) anyFailed = true;
            } catch (error) {
                console.error(`Error checking status for Batch ID ${jobInfo.batchId}:`, error.message);
                statusResults.push({ ...jobInfo, status: 'error', error: error.message });
                allCompleted = false; // Consider an error as not completed
                anyFailed = true; // Treat check error as failure for summary
            }
        }
        
        console.log("\n--- Status Summary ---");
        if (allCompleted) {
            console.log("All checked batch jobs are completed.");
        } else if (anyFailed) {
            console.log("Some batch jobs have failed, expired, been cancelled, or encountered errors during check.");
        } else {
             console.log("Some batch jobs are still processing.");
        }

        // Optionally save detailed status results to a file if needed
        // const statusFilePath = path.join('temp', 'batch_statuses.json');
        // await fs.promises.writeFile(statusFilePath, JSON.stringify(statusResults, null, 2), 'utf-8');
        // console.log(`\nDetailed status results saved to: ${statusFilePath}`);

    });

program
    .command('download')
    .description('Download and process batch job results')
    .option('-s, --submissions-file <path>', 'JSON file with submission details', 'temp/submitted_batches.json')
    .option('-b, --batch-id <id>', 'Download results for a specific Batch ID')
    .option('-o, --output <path>', 'Output directory', 'results')
    .option('--force', 'Attempt download even if job status is not \'completed\'')
    .action(async (options) => {
        const outputDir = options.output;
        await fs.promises.mkdir(outputDir, { recursive: true }); // Ensure output dir exists

        let jobsToDownload = [];

        if (options.batchId) {
            // Download a single specified batch ID
            console.log(`Attempting to download results for specific Batch ID: ${options.batchId}`);
            jobsToDownload.push({ batchId: options.batchId, source: 'option' });
        } else {
            // Read batch IDs from the submissions file
            const submissionsFilePath = options.submissionsFile;
            try {
                if (!fs.existsSync(submissionsFilePath)) {
                    console.error(`Error: Submissions file not found at ${submissionsFilePath}`);
                    console.error(`Please run 'submit' first or specify a Batch ID using --batch-id.`);
                    process.exit(1);
                }
                const fileContent = await fs.promises.readFile(submissionsFilePath, 'utf-8');
                const submissionResults = JSON.parse(fileContent);
                
                if (!Array.isArray(submissionResults)) {
                     console.error(`Error: Invalid format in ${submissionsFilePath}. Expected an array.`);
                     process.exit(1);
                }

                jobsToDownload = submissionResults
                    .filter(r => r.status === 'success' && r.batchId)
                    .map(r => ({ batchId: r.batchId, filePath: r.filePath, source: 'file' }));

                if (jobsToDownload.length === 0) {
                    console.log(`No successfully submitted batch jobs found in ${submissionsFilePath} to download.`);
                    process.exit(0);
                }
                console.log(`Found ${jobsToDownload.length} batch job(s) to potentially download from ${submissionsFilePath}:`);

            } catch (error) {
                console.error(`Error reading or parsing submissions file ${submissionsFilePath}:`, error.message);
                process.exit(1);
            }
        }

        console.log('\n--- Downloading Results ---');
        const downloadSummary = [];

        for (const jobInfo of jobsToDownload) {
            const batchId = jobInfo.batchId;
            console.log(`\nProcessing Batch ID: ${batchId}` + (jobInfo.filePath ? ` (from ${jobInfo.filePath})` : ''));

            try {
                const status = await batchApiClient.getBatchJobStatus(batchId);
                console.log(`  Status: ${status.status}`);

                if (status.status !== 'completed' && !options.force) {
                    console.log(`  Skipping download (status is not 'completed'). Use --force to override.`);
                    downloadSummary.push({ ...jobInfo, downloadStatus: 'skipped', reason: `Status: ${status.status}` });
                    continue;
                }
                
                if (status.status !== 'completed' && options.force) {
                    console.warn(`  Warning: Forcing download attempt for job with status: ${status.status}`);
                }

                if (!status.output_file_id) {
                     console.warn(`  Skipping download: No output_file_id found for this batch job.`);
                     downloadSummary.push({ ...jobInfo, downloadStatus: 'skipped', reason: 'No output_file_id' });
                     continue;
                }

                // Download Output File
                const outputJsonlPath = path.join(outputDir, `batch_${batchId}_output.jsonl`);
                console.log(`  Downloading output file ${status.output_file_id} to ${outputJsonlPath}...`);
                await fileApiClient.downloadFile(status.output_file_id, outputJsonlPath);
                console.log(`    Output downloaded successfully.`);
                downloadSummary.push({ ...jobInfo, downloadStatus: 'success', outputJsonl: outputJsonlPath });

                // Download Error File (if exists)
                let errorJsonlPath = null;
                if (status.error_file_id) {
                    errorJsonlPath = path.join(outputDir, `batch_${batchId}_errors.jsonl`);
                    console.log(`  Downloading error file ${status.error_file_id} to ${errorJsonlPath}...`);
                    try {
                         await fileApiClient.downloadFile(status.error_file_id, errorJsonlPath);
                         console.log(`    Errors downloaded successfully.`);
                         // Find the corresponding summary entry and add error path
                         const summaryEntry = downloadSummary.find(s => s.batchId === batchId && s.downloadStatus === 'success');
                         if(summaryEntry) summaryEntry.errorJsonl = errorJsonlPath;
                    } catch (err) {
                         console.error(`    Error downloading error file ${status.error_file_id}:`, err.message);
                         // Update summary entry to reflect error file download failure
                         const summaryEntry = downloadSummary.find(s => s.batchId === batchId && s.downloadStatus === 'success');
                         if(summaryEntry) summaryEntry.errorJsonl = `DOWNLOAD_FAILED: ${err.message}`;
                    }
                }

                // Convert JSONL to CSV
                const csvOutputPath = path.join(outputDir, `batch_${batchId}_output.csv`);
                console.log(`  Converting ${outputJsonlPath} to ${csvOutputPath}...`);
                await convertJsonlToCsv(outputJsonlPath, csvOutputPath);
                console.log(`    CSV created successfully.`);
                // Update summary entry with CSV path
                 const summaryEntry = downloadSummary.find(s => s.batchId === batchId && s.downloadStatus === 'success');
                 if(summaryEntry) summaryEntry.outputCsv = csvOutputPath;

            } catch (error) {
                console.error(`  Error processing Batch ID ${batchId}:`, error.message);
                 // Add or update summary for this batch ID failure
                 const existingEntryIndex = downloadSummary.findIndex(s => s.batchId === batchId);
                 if (existingEntryIndex > -1) {
                     downloadSummary[existingEntryIndex].downloadStatus = 'error';
                     downloadSummary[existingEntryIndex].reason = error.message;
                 } else {
                     downloadSummary.push({ ...jobInfo, downloadStatus: 'error', reason: error.message });
                 }
            }
        }

        console.log('\n--- Download Summary ---');
        const successfulDownloads = downloadSummary.filter(r => r.downloadStatus === 'success');
        const skippedDownloads = downloadSummary.filter(r => r.downloadStatus === 'skipped');
        const failedDownloads = downloadSummary.filter(r => r.downloadStatus === 'error');

        console.log(`Successfully processed and downloaded results for ${successfulDownloads.length} batch job(s):`);
        successfulDownloads.forEach(r => {
            console.log(`  - Batch ID: ${r.batchId}`);
            console.log(`    Output JSONL: ${r.outputJsonl}`);
            if (r.errorJsonl && !r.errorJsonl.startsWith('DOWNLOAD_FAILED')) console.log(`    Error JSONL: ${r.errorJsonl}`);
            if (r.errorJsonl && r.errorJsonl.startsWith('DOWNLOAD_FAILED')) console.warn(`    Error JSONL: ${r.errorJsonl}`);
            if (r.outputCsv) console.log(`    Output CSV: ${r.outputCsv}`);
        });

         if (skippedDownloads.length > 0) {
            console.warn(`\nSkipped ${skippedDownloads.length} batch job(s):`);
            skippedDownloads.forEach(r => console.warn(`  - Batch ID: ${r.batchId}, Reason: ${r.reason}`));
        }

        if (failedDownloads.length > 0) {
            console.error(`\nFailed to process or download results for ${failedDownloads.length} batch job(s):`);
            failedDownloads.forEach(r => console.error(`  - Batch ID: ${r.batchId}, Reason: ${r.reason}`));
            // Optionally exit with error
            // process.exit(1);
        }

    });

async function convertJsonlToCsv(inputFilePath, outputFilePath) {
    const fileStream = fs.createReadStream(inputFilePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const csvData = [];
    const headersSet = new Set(['custom_id']); // Start with 'custom_id' as a default header

    for await (const line of rl) {
        const jsonObject = JSON.parse(line);
        const customId = jsonObject.custom_id;
        const choices = jsonObject.response.body.choices;

        if (Array.isArray(choices)) {
            choices.forEach(choice => {
                let content = choice.message.content;
                if (content !== null) {
                    // Remove newline characters from content
                    content = content.replace(/\n/g, ' ').replace(/\r/g, ' ');
                } else {
                    console.warn(`Warning: 'content' is null for custom_id: ${customId}`);
                    content = '';
                }
                let result = { custom_id: customId };

                try {
                    // Attempt to parse the content as JSON
                    const parsedContent = JSON.parse(content);
                    Object.entries(parsedContent).forEach(([key, value]) => {
                        headersSet.add(key);
                        // Remove newline characters from each value
                        result[key] = typeof value === 'string' ? value.replace(/\n/g, ' ').replace(/\r/g, ' ') : value;
                    });
                } catch (e) {
                    // If parsing fails, treat content as a plain string
                    result['content'] = content;
                    headersSet.add('content');
                }

                csvData.push(result);
            });
        } else {
            console.warn(`Warning: 'choices' is not an array for custom_id: ${customId}`);
        }
    }

    const headers = Array.from(headersSet);
    const csv = parse(csvData, { fields: headers });
    fs.writeFileSync(outputFilePath, csv);
}

program.parse(); 