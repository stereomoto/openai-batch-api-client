const fs = require('fs-extra');
const path = require('path');

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
            return `${idPrefix}${row[customIdColumn]}`;
        }
        return `${idPrefix}${rowIndex}`;
    }

    replaceTemplateVariables(template, data) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
            return data[variable] || match;
        });
    }

    async generateBatchRequest(csvData, promptTemplate, outputPath, customIdColumn = this.config.custom_id_column, idPrefix = '') {
        console.log('Generating batch request with:', {
            rowCount: csvData.length,
            model: this.config.model,
            customIdColumn,
            idPrefix
        });

        const usedIds = new Set();

        const batchRequests = csvData.map((row, index) => {
            let customId = this.generateCustomId(row, customIdColumn, index, idPrefix);
            let suffix = 1;
            while (usedIds.has(customId)) {
                customId = `${customId}_${suffix++}`;
            }
            usedIds.add(customId);

            const content = this.replaceTemplateVariables(promptTemplate, row);

            return {
                custom_id: customId,
                method: 'POST',
                url: '/v1/chat/completions',
                body: {
                    model: this.config.model,
                    messages: [
                        {
                            role: 'user',
                            content: content
                        }
                    ],
                    temperature: this.config.temperature,
                    max_tokens: this.config.max_tokens,
                    response_format: this.config.response_format || { type: 'json_object' }
                }
            };
        });

        // Validate batch size
        if (batchRequests.length > 50000) {
            throw new Error('Batch size exceeds maximum limit of 50,000 requests');
        }

        // Convert to JSONL format
        const jsonlContent = batchRequests.map(request => JSON.stringify(request)).join('\n');
        
        // Check file size (200MB limit)
        const contentSize = Buffer.byteLength(jsonlContent, 'utf8');
        if (contentSize > 200 * 1024 * 1024) {
            throw new Error('Generated JSONL file exceeds maximum size of 200MB');
        }

        console.log('Writing batch request file:', {
            path: outputPath,
            requestCount: batchRequests.length,
            fileSizeMB: (contentSize / (1024 * 1024)).toFixed(2)
        });

        await fs.writeFile(outputPath, jsonlContent, 'utf-8');

        return {
            requestCount: batchRequests.length,
            filePath: outputPath,
            fileSizeMB: (contentSize / (1024 * 1024)).toFixed(2)
        };
    }
}

module.exports = BatchRequestGenerator; 