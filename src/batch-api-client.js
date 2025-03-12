const OpenAI = require('openai');

class BatchApiClient {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.openai = new OpenAI({ apiKey });
        console.log('BatchApiClient initialized with API key:', `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`);
    }

    async createBatchJob(fileId) {
        try {
            console.log('Creating batch job for file:', fileId);
            
            const response = await this.openai.batches.create({
                input_file_id: fileId,
                endpoint: "/v1/chat/completions",
                completion_window: "24h"
            });
            
            console.log('Batch job created successfully:', {
                id: response.id,
                status: response.status,
                created_at: response.created_at,
                expires_at: response.expires_at
            });
            
            return response;
        } catch (error) {
            console.error('Detailed error information:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                type: error.type,
                code: error.code,
                response: error.response
            });
            
            throw new Error(`Error creating batch job: ${error.message}`);
        }
    }

    async getBatchJobStatus(batchId) {
        try {
            console.log('Checking status for batch job:', batchId);
            
            const response = await this.openai.batches.retrieve(batchId);
            
            console.log('Batch job status retrieved:', {
                id: response.id,
                status: response.status,
                progress: response.request_counts,
                created_at: response.created_at,
                expires_at: response.expires_at,
                output_file_id: response.output_file_id,
                error_file_id: response.error_file_id
            });
            
            return response;
        } catch (error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                type: error.type,
                code: error.code
            });
            throw new Error(`Error getting batch job status: ${error.message}`);
        }
    }

    async listBatchJobs(limit = 10) {
        try {
            console.log('Listing batch jobs');
            
            const response = await this.openai.batches.list({
                limit: limit
            });
            
            console.log('Batch jobs retrieved:', {
                count: response.data.length,
                jobs: response.data.map(job => ({
                    id: job.id,
                    status: job.status,
                    created_at: job.created_at
                }))
            });
            
            return response.data;
        } catch (error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                type: error.type,
                code: error.code
            });
            throw new Error(`Error listing batch jobs: ${error.message}`);
        }
    }

    async cancelBatchJob(batchId) {
        try {
            console.log('Canceling batch job:', batchId);
            
            const response = await this.openai.batches.cancel(batchId);
            
            console.log('Batch job canceled:', {
                id: response.id,
                status: response.status
            });
            
            return response;
        } catch (error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                type: error.type,
                code: error.code
            });
            throw new Error(`Error canceling batch job: ${error.message}`);
        }
    }
}

module.exports = BatchApiClient; 