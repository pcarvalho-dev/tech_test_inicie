import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private subscriptions = new Map<string, (topic: string, payload: Buffer) => void>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.getOrThrow<string>('MQTT_HOST');
    const port = this.config.getOrThrow<string>('MQTT_PORT');

    this.client = mqtt.connect(`mqtt://${host}:${port}`, {
      clientId: `backend_${Math.random().toString(16).slice(2)}`,
      clean: true,
      reconnectPeriod: 1000,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to EMQX broker');
    });

    this.client.on('message', (topic, payload) => {
      this.subscriptions.forEach((handler, pattern) => {
        if (this.topicMatches(pattern, topic)) {
          handler(topic, payload);
        }
      });
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('Reconnecting to EMQX broker...');
    });
  }

  onModuleDestroy() {
    this.client?.end();
  }

  publish(topic: string, payload: string | object, qos: 0 | 1 | 2 = 1): void {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.client.publish(topic, message, { qos });
  }

  subscribe(topic: string, handler: (topic: string, payload: Buffer) => void): void {
    this.client.subscribe(topic, { qos: 1 });
    this.subscriptions.set(topic, handler);
  }

  unsubscribe(topic: string): void {
    this.client.unsubscribe(topic);
    this.subscriptions.delete(topic);
  }

  private topicMatches(pattern: string, topic: string): boolean {
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') return true;
      if (patternParts[i] !== '+' && patternParts[i] !== topicParts[i]) return false;
    }

    return patternParts.length === topicParts.length;
  }
}
