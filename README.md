# OpenAI Batch API Processor

A command-line tool for processing data through OpenAI's Batch API. This tool helps automate the process of preparing, uploading, submitting, monitoring, and downloading results for large datasets processed via the Batch API.

## Features

- Process large CSV files efficiently.
- Uses custom prompt templates for generating API requests.
- Automatically splits large input files into multiple batch request files under OpenAI's size limits (currently 200MB).
- Handles uploading multiple request files.
- Submits separate batch jobs for each uploaded file.
- Tracks multiple batch jobs automatically.
- Downloads and consolidates results from multiple completed jobs.
- Converts downloaded JSONL results to CSV format.
- Flexible configuration via `config.json`.

## Prerequisites

- Node.js (v18 or higher recommended)
- npm (usually included with Node.js)
- OpenAI API key

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Copy `.env.example` to `.env` and add your OpenAI API key:
    ```bash
    cp .env.example .env
    # Edit .env and add your OPENAI_API_KEY
    ```

## Configuration

1.  **Input Data:** Place your input CSV file in the `input/` directory (e.g., `input/input.csv`). Ensure it has appropriate headers.
2.  **Prompt Template:** Create your prompt template in `input/prompt.txt`. Use double curly braces `{{}}` for variables corresponding to your CSV column headers (e.g., `Analyze this text: {{text_column}}`).
3.  **API Configuration:** Adjust API call settings in `input/config.json`. This includes `model`, `temperature`, `max_tokens`, and optionally `response_format` (defaults to `{ "type": "json_object" }`). You can also specify a `custom_id_column` here, which will be overridden by the `--id-column` option in the `prepare` command if used.

## Workflow Overview

The tool guides you through the following steps:

1.  **Prepare:** Reads the input CSV, prompt template, and config. Generates one or more `batch_request_part_*.jsonl` files in the `temp/` directory, ensuring each is under the size limit.
2.  **Upload:** Finds and uploads all `batch_request_part_*.jsonl` files from `temp/` to OpenAI. Stores the resulting File IDs in `temp/uploaded_files.json`.
3.  **Submit:** Reads `temp/uploaded_files.json` and submits a separate batch job to OpenAI for each File ID. Stores the resulting Batch IDs in `temp/submitted_batches.json`.
4.  **Check:** Reads `temp/submitted_batches.json` and checks the status of each submitted batch job.
5.  **Download:** Reads `temp/submitted_batches.json`, checks the status of each job, and downloads the results for completed jobs into the `results/` directory. Converts the downloaded JSONL output files to CSV.

## Usage

You can run the commands using `node src/cli.js <command> [options]` or using the npm scripts (e.g., `npm run prepare`).

### 1. Prepare Batch Request Files

Generates JSONL request file(s) in the `temp/` directory.

```bash
node src/cli.js prepare [options]
# or
npm run prepare -- [options] # Note the -- when passing options via npm run
```

**Options:**
*   `-i, --input <path>`: Input CSV file path (default: `input/input.csv`).
*   `-p, --prompt <path>`: Prompt template file path (default: `input/prompt.txt`).
*   `-c, --config <path>`: Configuration file path (default: `input/config.json`).
*   `--id-column <column>`: CSV column to use for `custom_id` in requests.
*   `--id-prefix <prefix>`: Optional prefix for generated `custom_id`s.

**Output:**
*   One or more `temp/batch_request_part_N.jsonl` files.

### 2. Upload Request Files

Uploads the generated JSONL file(s) to OpenAI.

```bash
node src/cli.js upload [options]
# or
npm run upload -- [options]
```

**Options:**
*   `-f, --file <pattern>`: File pattern for JSONL files to upload (default: `temp/batch_request_part_*.jsonl`).

**Output:**
*   Logs File IDs for uploaded files.
*   Creates `temp/uploaded_files.json` containing details of successful uploads (filePath, fileId).

### 3. Submit Batch Jobs

Submits batch jobs to OpenAI using the uploaded File IDs.

```bash
node src/cli.js submit [options]
# or
npm run submit -- [options]
```

**Options:**
*   `-u, --uploads-file <path>`: Path to the JSON file containing uploaded file details (default: `temp/uploaded_files.json`).

**Output:**
*   Logs Batch IDs for created jobs.
*   Creates `temp/submitted_batches.json` containing details of submitted jobs (filePath, fileId, batchId, status).

### 4. Check Job Status

Checks the status of submitted batch jobs.

```bash
node src/cli.js check [options]
# or
npm run check -- [options]
```

**Options:**
*   `-s, --submissions-file <path>`: Path to the JSON file containing submitted job details (default: `temp/submitted_batches.json`). Checks all jobs in this file.
*   `-b, --batch-id <id>`: Check status for a *specific* Batch ID instead of reading the file.

**Output:**
*   Logs the status for each checked job.
*   Provides a summary of job statuses.

### 5. Download Results

Downloads and processes results for completed batch jobs.

```bash
node src/cli.js download [options]
# or
npm run download -- [options]
```

**Options:**
*   `-s, --submissions-file <path>`: Path to the JSON file containing submitted job details (default: `temp/submitted_batches.json`). Downloads results for completed jobs in this file.
*   `-b, --batch-id <id>`: Download results for a *specific* Batch ID instead of reading the file.
*   `-o, --output <path>`: Output directory for results (default: `results`).
*   `--force`: Attempt to download results even if the job status is not 'completed'.

**Output:**
*   Downloads `batch_<batchId>_output.jsonl` and `batch_<batchId>_errors.jsonl` (if available) to the output directory.
*   Converts each output JSONL to `batch_<batchId>_output.csv` in the same directory.
*   Logs a summary of downloads.

## File Structure

```
.
├── src/                      # Source code
│   ├── input-handler.js
│   ├── batch-request-generator.js
│   ├── file-api-client.js
│   ├── batch-api-client.js
│   └── cli.js
├── input/                    # Input files
│   ├── input.csv             # Your input data
│   ├── prompt.txt            # Your prompt template
│   └── config.json           # API configuration
├── temp/                     # Intermediate files
│   ├── batch_request_part_*.jsonl # Generated request files
│   ├── uploaded_files.json    # Records of uploaded files and their IDs
│   └── submitted_batches.json # Records of submitted jobs and their IDs
├── results/                  # Output files
│   ├── batch_<batchId>_output.jsonl # Raw output from OpenAI
│   ├── batch_<batchId>_errors.jsonl # Raw errors from OpenAI (if any)
│   └── batch_<batchId>_output.csv   # Processed output in CSV format
├── .env.example              # Example environment file
├── package.json
├── package-lock.json
└── README.md
```

## Error Handling

The tool includes error handling for:
- Missing or invalid configuration.
- File reading/writing issues.
- Exceeding OpenAI API limits (e.g., file size, request count).
- API errors during file upload, job submission, status checks, and downloads.
- Parsing errors.

Check the console output for specific error messages.