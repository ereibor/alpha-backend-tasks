import { Module } from "@nestjs/common";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";

@Module({
  imports: [
    RabbitMQModule.forRoot({
      exchanges: [{ name: "candidate_summaries", type: "direct" }],
      uri: process.env.RABBITMQ_URL ?? "amqp://localhost:5672",
    }),
  ],
  exports: [RabbitMQModule],
})
export class QueueModule {}
