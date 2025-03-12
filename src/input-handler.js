const fs = require('fs-extra');
const csv = require('csv-parser');
const path = require('path');

class InputHandler {
    constructor() {
        this.results = [];
    }

    async readCSV(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', (error) => reject(error));
        });
    }

    async readPromptTemplate(filePath) {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            throw new Error(`Error reading prompt template: ${error.message}`);
        }
    }

    async readConfig(filePath) {
        try {
            const configContent = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(configContent);
        } catch (error) {
            throw new Error(`Error reading config: ${error.message}`);
        }
    }

    validateConfig(config) {
        const requiredFields = ['model', 'temperature', 'max_tokens'];
        for (const field of requiredFields) {
            if (!(field in config)) {
                throw new Error(`Missing required field in config: ${field}`);
            }
        }
        return true;
    }
}

module.exports = InputHandler; 