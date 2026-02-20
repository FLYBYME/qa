import 'dotenv/config';
import { ServiceManager, ConsoleLogger } from "tool-ms";
import { Adapter } from "tool-ms";
import path from "path";
import { HttpServerManager } from "tool-ms";

export const logger = new ConsoleLogger();
export const manager = new ServiceManager({ logger });
export const adapter = new Adapter.Adapter(manager);

const httpServerManager = new HttpServerManager(manager, {
    port: 3000,
    logger,
    docsPath: '/_meta/routes',
    apiPrefix: '/api',
    staticFiles: [
        {
            directory: path.join(__dirname, '../dist'),
            path: '/',
        },
    ],
});

async function main() {
    await manager.registerServiceActions(path.join(__dirname, 'actions'));
    await manager.start();
    await httpServerManager.start();
}

main();