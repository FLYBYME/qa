import { Adapter, HttpClient, Terminal, TerminalCommand } from 'tool-ms';
import crypto from 'crypto';
import { ChatOutput } from './actions/chat';

const DEFAULT_MODEL = 'qwen3:4b-instruct';
const API_URL = 'http://localhost:3000';

class ChatSession {
    private client: HttpClient;
    private term: Terminal;

    constructor() {
        this.client = new HttpClient(API_URL);
        this.term = new Terminal({
            commands: this.getCommands(),
            defaultHandler: (input) => this.handleDefaultChat(input)
        });
    }

    /**
     * Helper to log JSON output consistently
     */
    private logResult(data: any) {
        this.term.log(JSON.stringify(data, null, 2));
    }

    /**
     * Initialization Logic
     */
    async start() {
        try {
            await this.client.load();
            this.term.run();

            this.term.log('Session started. Initializing context...');

            this.term.focusInput();
        } catch (err: any) {
            this.term.error('Initialization Error: ' + err.message);
            process.exit(1);
        }
    }


    /**
     * Command Definitions
     */
    private getCommands(): TerminalCommand[] {
        return [
            {
                name: 'clear',
                description: 'Reset terminal and session',
                execute: async () => {
                    await this.client.call('agents.clearSession', {});
                    this.term.clear();
                },
                type: 'command'
            }
        ];
    }

    private async handleDefaultChat(input: string) {


        const result = await this.client.call<ChatOutput>('agents.chat', {
            prompt: input,
        });


        for (const message of result.messages) {
            if (message.role === 'assistant') {
                this.term.log('-'.repeat(80));
                this.term.log(message.content || 'No content');
                this.term.log('-'.repeat(80));
                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        this.term.log(`Tool call: ${toolCall.function.name}`);
                    }
                }
            }
        }
    }
}

// Start the session
new ChatSession().start();