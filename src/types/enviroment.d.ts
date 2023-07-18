export { };

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            DB_URI: string;
            RABBITMQ_URI: string;
            MOMENTUM_INSTANCE_URL: string;
            MM_PORT: number;
            HTTP_PORT: number;
        }
    }
}