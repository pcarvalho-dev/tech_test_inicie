import mqtt, { MqttClient } from 'mqtt';

const MQTT_WS_URL = 'ws://localhost:8083/mqtt';

export function createMqttClient(userId: string, token: string): MqttClient {
  return mqtt.connect(MQTT_WS_URL, {
    clientId: `professor-popup-${userId}-${Date.now()}`,
    username: userId,
    password: token,
    clean: true,
    reconnectPeriod: 0,
  });
}
