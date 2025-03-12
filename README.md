# OpenAI Batch API Processor

A command-line tool for processing data through OpenAI's Batch API. This tool helps automate the process of sending multiple requests to OpenAI's API in batch mode, making it efficient to process large datasets.

## Features

- Process CSV files with custom data
- Template-based prompt generation
- Automatic batch processing through OpenAI's API
- Progress monitoring and result handling
- Flexible configuration options

## Prerequisites

- Node.js (v14 or higher)
- OpenAI API key

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and add your OpenAI API key:
   ```bash
   cp .env.example .env
   ```

## Configuration

1. Place your input CSV file in the `input` directory
2. Configure your prompt template in `input/prompt.txt`
3. Adjust settings in `input/config.json`

## Usage

The tool provides several commands for different stages of batch processing:

### Prepare Batch Request

```bash
node src/cli.js prepare -i input/data.csv -p input/prompt.txt -c input/config.json
```

Options:
- `-i, --input`: Input CSV file path (default: input/input.csv)
- `-p, --prompt`: Prompt template file path (default: input/prompt.txt)
- `-c, --config`: Configuration file path (default: input/config.json)
- `--id-column`: CSV column to use as custom_id
- `--id-prefix`: Prefix for generated custom_ids

### Upload File

```bash
node src/cli.js upload -f temp/batch_request.jsonl
```

### Submit Batch Job

```bash
node src/cli.js submit <fileId>
```

### Check Job Status

```bash
node src/cli.js check <batchId>
```

### Download Results

```bash
node src/cli.js download <batchId> -o results
```

## File Structure

```
.
├── src/
│   ├── input-handler.js
│   ├── batch-request-generator.js
│   ├── file-api-client.js
│   ├── batch-api-client.js
│   └── cli.js
├── input/
│   ├── input.csv
│   ├── prompt.txt
│   └── config.json
├── temp/
│   └── batch_request.jsonl
├── output/
│   └── processed_{timestamp}.csv
├── results/
│   ├── batch_{batch_id}_output.jsonl
│   └── batch_{batch_id}_errors.jsonl
└── logs/
    └── log_{timestamp}.txt
```

## Error Handling

The tool includes comprehensive error handling:
- Input validation
- API error handling
- File operation error handling
- Status monitoring