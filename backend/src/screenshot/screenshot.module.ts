import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Screenshot } from './screenshot.entity';
import { ScreenshotService } from './screenshot.service';
import { ScreenshotController } from './screenshot.controller';
import { MqttModule } from '../mqtt/mqtt.module';

@Module({
  imports: [TypeOrmModule.forFeature([Screenshot]), MqttModule],
  providers: [ScreenshotService],
  controllers: [ScreenshotController],
})
export class ScreenshotModule {}
