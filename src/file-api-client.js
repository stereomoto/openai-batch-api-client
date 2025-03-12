const OpenAI = require('openai');
const fs = require('fs-extra');

class FileApiClient {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.openai = new OpenAI({ apiKey });
        console.log('FileApiClient initialized with API key:', `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`);
    }

    async uploadFile(filePath) {
        try {
            console.log('Uploading file:', filePath);
            
            // Check if file exists
            const stats = await fs.stat(filePath);
            console.log('File stats:', {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            });

            const fileStream = fs.createReadStream(filePath);
            console.log('File stream created successfully');

            const response = await this.openai.files.create({
                file: fileStream,
                purpose: 'batch'
            });

            console.log('File uploaded successfully:', {
                id: response.id,
                filename: response.filename,
                bytes: response.bytes,
                created_at: response.created_at,
                purpose: response.purpose
            });

            return response;
        } catch (error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                type: error.type,
                stack: error.stack
            });
            throw new Error(`Error uploading file: ${error.message}`);
        }
    }

    async downloadFile(fileId, outputPath) {
        try {
            console.log('Downloading file:', {
                fileId: fileId,
                outputPath: outputPath
            });

            const fileInfo = await this.openai.files.retrieve(fileId);
            console.log('File info retrieved:', {
                id: fileInfo.id,
                filename: fileInfo.filename,
                bytes: fileInfo.bytes,
                created_at: fileInfo.created_at,
                purpose: fileInfo.purpose
            });

            const fileContent = await this.openai.files.content(fileId);
            console.log('File content retrieved, writing to:', outputPath);

            await fs.writeFile(outputPath, fileContent, 'utf-8');
            console.log('File written successfully');

            return outputPath;
        } catch (error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                type: error.type,
                stack: error.stack
            });
            throw new Error(`Error downloading file: ${error.message}`);
        }
    }

    async deleteFile(fileId) {
        try {
            console.log('Deleting file:', fileId);

            await this.openai.files.del(fileId);
            console.log('File deleted successfully');

            return true;
        } catch (error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                type: error.type
            });
            throw new Error(`Error deleting file: ${error.message}`);
        }
    }

    async listFiles() {
        try {
            console.log('Listing files');

            const response = await this.openai.files.list();
            console.log('Files retrieved:', {
                count: response.data.length,
                files: response.data.map(file => ({
                    id: file.id,
                    filename: file.filename,
                    bytes: file.bytes,
                    created_at: file.created_at,
                    purpose: file.purpose
                }))
            });

            return response.data;
        } catch (error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                type: error.type
            });
            throw new Error(`Error listing files: ${error.message}`);
        }
    }
}

module.exports = FileApiClient; 