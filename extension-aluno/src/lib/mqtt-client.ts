import mqtt, { MqttClient } from 'mqtt';

const MQTT_WS_URL = process.env.NEXT_PUBLIC_MQTT_WS_URL ?? 'ws://localhost:8083/mqtt';

export function createMqttClient(userId: string): MqttClient {
  return mqtt.connect(MQTT_WS_URL, {
    clientId: `aluno-popup-${userId}-${Date.now()}`,
    clean: true,
    reconnectPeriod: 0,
  });
}
