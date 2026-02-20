import { ServiceAction, Context } from 'tool-ms';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { getSurvey } from '../store/surveyStore';

export const SurvayPdfInputSchema = z.object({
    surveyId: z.string().describe('The survey ID to export to PDF'),
});
export type SurvayPdfInput = z.infer<typeof SurvayPdfInputSchema>;

export const SurvayPdfOutputSchema = z.object({
    success: z.boolean(),
});
export type SurvayPdfOutput = z.infer<typeof SurvayPdfOutputSchema>;

export const SurvayPdfAction: ServiceAction<SurvayPdfInput, any> = {
    name: 'survay-pdf',
    version: 1,
    description: 'Generate a PDF report for a survey.',
    domain: 'survay',
    tags: ['survay'],
    input: SurvayPdfInputSchema,
    output: z.any(), // Returning a stream or buffer, so we use any for schema
    rest: {
        method: 'POST',
        path: '/survay-pdf',
    },
    handler: async (ctx: Context<SurvayPdfInput>) => {
        const { surveyId } = ctx.params;
        const survey = getSurvey(surveyId);

        if (!survey) {
            throw new Error(`Survey ${surveyId} not found`);
        }

        const doc = new PDFDocument({ margin: 50 });

        // Set response headers for PDF download if possible via Context
        // Note: tool-ms HttpServerManager might not expose direct res access easily here, 
        // but we can return bytes and let the handler handle it OR we might need to 
        // check if tool-ms supports returning raw streams.
        // For now, let's collect it into a buffer and return the buffer.

        const chunks: Buffer[] = [];
        doc.on('data', chunk => chunks.push(chunk));

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const result = Buffer.concat(chunks);
                // We'll return the buffer. The HttpServerManager in tool-ms
                // might need to be told this is a PDF.
                // However, since we are in a ServiceAction, we usually return JSON.
                // If we want to return raw bytes with specific headers, 
                // we might need to base64 it and return as JSON, 
                // OR check if we can access the underlying response object.
                resolve({
                    pdfBase64: result.toString('base64'),
                    filename: `Survey_${survey.topic.replace(/\s+/g, '_')}.pdf`
                });
            });
            doc.on('error', reject);

            // ─── Document Content ─────────────────────────────────────────────

            // Header
            doc.fillColor('#7c6af7').fontSize(24).text('Survey Insights Report', { align: 'center' });
            doc.fillColor('#9b9bc8').fontSize(12).text(new Date(survey.createdAt).toLocaleString(), { align: 'center' });
            doc.moveDown(2);

            // Topic section
            doc.fillColor('#000000').fontSize(18).text(`Topic: ${survey.topic}`);
            doc.moveDown(1);

            // Summary section
            if (survey.summary) {
                doc.fillColor('#7c6af7').fontSize(16).text('Executive Summary');
                doc.fillColor('#333333').fontSize(11).text(survey.summary.summary);
                doc.moveDown(1);

                doc.fillColor('#7c6af7').fontSize(14).text('Key Insights');
                survey.summary.insights.forEach((insight, i) => {
                    doc.fillColor('#333333').fontSize(10).text(`${i + 1}. ${insight}`, { indent: 15 });
                });
                doc.moveDown(1);

                doc.fillColor('#7c6af7').fontSize(14).text('Recommendations');
                survey.summary.recommendations.forEach((rec, i) => {
                    doc.fillColor('#333333').fontSize(10).text(`${i + 1}. ${rec}`, { indent: 15 });
                });
                doc.moveDown(2);
            }

            // Answers section
            if (survey.answers && survey.answers.length > 0) {
                doc.fillColor('#7c6af7').fontSize(16).text('Detailed Responses');
                doc.moveDown(0.5);
                survey.answers.forEach((item, i) => {
                    doc.fillColor('#000000').fontSize(11).text(`Q${i + 1}: ${item.question.label}`, { stroke: true });
                    doc.fillColor('#555555').fontSize(10).text(`A: ${item.answer}`, { indent: 20 });
                    doc.moveDown(0.5);
                });
                doc.moveDown(1.5);
            }

            // Chat section
            if (survey.chat && survey.chat.length > 0) {
                doc.fillColor('#7c6af7').fontSize(16).text('AI Consultation Log');
                doc.moveDown(0.5);
                survey.chat.forEach((turn) => {
                    const role = turn.role === 'user' ? 'You' : 'AI Assistant';
                    doc.fillColor(turn.role === 'user' ? '#000000' : '#4fc3f7')
                        .fontSize(10)
                        .text(`${role}: ${turn.content}`, { indent: 10 });
                    doc.moveDown(0.5);
                });
            }

            // Footer
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                doc.fillColor('#999999').fontSize(8).text(
                    `Page ${i + 1} of ${range.count}`,
                    50,
                    doc.page.height - 50,
                    { align: 'center' }
                );
            }

            doc.end();
        });
    }
};
