export { };

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            DATABASE_URL: string;
            RABBITMQ_URI: string;
            MOMENTUM_INSTANCE_URL: string;
            MM_PORT: number;
            HTTP_PORT: number;
        }
    }
}