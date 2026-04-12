import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MqttModule } from './mqtt/mqtt.module';
import { PresenceModule } from './presence/presence.module';
import { ChatModule } from './chat/chat.module';
import { ScreenshotModule } from './screenshot/screenshot.module';
import { MqttAuthModule } from './mqtt-auth/mqtt-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        migrationsRun: true,
      }),
    }),
    UsersModule,
    AuthModule,
    MqttModule,
    PresenceModule,
    ChatModule,
    ScreenshotModule,
    MqttAuthModule,
  ],
})
export class AppModule {}
