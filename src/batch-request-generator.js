const fs = require('fs-extra');
const path = require('path');

const MAX_FILE_SIZE = 190 * 1024 * 1024; // 190MB

class BatchRequestGenerator {
    constructor(config) {
        this.config = config;
        this.validateConfig(config);
    }

    validateConfig(config) {
        const requiredFields = ['model', 'temperature', 'max_tokens'];
        for (const field of requiredFields) {
            if (!(field in config)) {
                throw new Error(`Missing required field in config: ${field}`);
            }
        }
    }

    generateCustomId(row, customIdColumn, rowIndex, idPrefix = '') {
        if (customIdColumn && row[customIdColumn]) {
            // Ensure custom_id is a string and handle potential .0 suffixes from numeric IDs
            return `${idPrefix}${row[customIdColumn]}`.replace(/\.0+$/, '');
        }
        return `${idPrefix}${rowIndex}`;
    }

    replaceTemplateVariables(template, data) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
            // Ensure replaced values are strings
            const value = data[variable];
            return value !== undefined && value !== null ? String(value) : match;
        });
    }

    async generateBatchRequest(csvData, promptTemplate, outputDir, baseFilename, customIdColumn = this.config.custom_id_column, idPrefix = '') {
        console.log('Generating batch request with:', {
            rowCount: csvData.length,
            model: this.config.model,
            customIdColumn,
            idPrefix
        });

        if (csvData.length > 50000) {
            throw new Error('Input CSV exceeds maximum batch size limit of 50,000 requests');
        }

        await fs.ensureDir(outputDir); // Ensure output directory exists

        const usedIds = new Set();
        const generatedFiles = [];
        let currentFileSize = 0;
        let currentFilePart = 1;
        let currentRequestCount = 0;
        let totalRequestCount = 0;
        let writeStream = null;

        const createNewFile = () => {
            if (writeStream) {
                writeStream.end();
                console.log(`Closed file: ${generatedFiles[generatedFiles.length - 1]}, Size: ${(currentFileSize / (1024 * 1024)).toFixed(2)}MB, Requests: ${currentRequestCount}`);
            }
            const filePath = path.join(outputDir, `${baseFilename}_part_${currentFilePart}.jsonl`);
            generatedFiles.push(filePath);
            writeStream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
            currentFileSize = 0;
            currentRequestCount = 0;
            currentFilePart++;
             console.log(`Starting new file: ${filePath}`);
        };

        createNewFile(); // Start the first file

        for (let index = 0; index < csvData.length; index++) {
            const row = csvData[index];
            let customId = this.generateCustomId(row, customIdColumn, index, idPrefix);
            
            // Ensure uniqueness for custom_id
            let suffix = 1;
            const originalId = customId;
            while (usedIds.has(customId)) {
                customId = `${originalId}_dup${suffix++}`;
            }
            usedIds.add(customId);

            const content = this.replaceTemplateVariables(promptTemplate, row);

            const request = {
                custom_id: customId, // Already ensured it's a string and .0 removed
                method: 'POST',
                url: '/v1/chat/completions',
                body: {
                    model: this.config.model,
                    messages: [
                        {
                            role: 'user',
                            content: content // Content is already stringified by replaceTemplateVariables
                        }
                    ],
                    temperature: this.config.temperature,
                    max_tokens: this.config.max_tokens,
                    response_format: this.config.response_format || { type: 'json_object' }
                }
            };

            const jsonLine = JSON.stringify(request) + '\n';
            const lineSize = Buffer.byteLength(jsonLine, 'utf8');

            if (currentFileSize > 0 && currentFileSize + lineSize > MAX_FILE_SIZE) {
                createNewFile();
            }

            writeStream.write(jsonLine);
            currentFileSize += lineSize;
            currentRequestCount++;
            totalRequestCount++;
        }

        if (writeStream) {
             writeStream.end();
             console.log(`Closed final file: ${generatedFiles[generatedFiles.length - 1]}, Size: ${(currentFileSize / (1024 * 1024)).toFixed(2)}MB, Requests: ${currentRequestCount}`);
        }
        
        console.log(`Finished generating ${generatedFiles.length} file(s). Total requests: ${totalRequestCount}`);

        return {
            requestCount: totalRequestCount,
            filePaths: generatedFiles
        };
    }
}

module.exports = BatchRequestGenerator; 