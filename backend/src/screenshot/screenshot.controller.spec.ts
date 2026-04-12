import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenshotController } from './screenshot.controller';
import { ScreenshotService } from './screenshot.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const mockScreenshotService = {
  requestScreenshot: vi.fn(),
  getHistory: vi.fn(),
  getImagePath: vi.fn(),
  uploadFromHttp: vi.fn(),
  getStream: vi.fn(),
  getPendingRequest: vi.fn(),
  notifyCaptureFailed: vi.fn(),
};

const mockReq = { user: { id: 'prof-uuid' } };

describe('ScreenshotController', () => {
  let controller: ScreenshotController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ScreenshotController],
      providers: [{ provide: ScreenshotService, useValue: mockScreenshotService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ScreenshotController);
  });

  it('requestScreenshot delega para service com professorId e alunoId', async () => {
    mockScreenshotService.requestScreenshot.mockResolvedValue({ requestId: 'req-uuid' });
    await controller.requestScreenshot(mockReq, 'aluno-uuid');
    expect(mockScreenshotService.requestScreenshot).toHaveBeenCalledWith('prof-uuid', 'aluno-uuid');
  });

  it('getHistory delega para service com filtro opcional', async () => {
    mockScreenshotService.getHistory.mockResolvedValue([]);
    await controller.getHistory(mockReq, 'aluno-uuid');
    expect(mockScreenshotService.getHistory).toHaveBeenCalledWith('prof-uuid', 'aluno-uuid');
  });

  it('getImage chama sendFile com filename e root separados', async () => {
    mockScreenshotService.getImagePath.mockResolvedValue({ id: 'ss-1', filePath: 'file.png' });
    const mockRes = { sendFile: vi.fn() };

    await controller.getImage('ss-1', mockRes);
    expect(mockRes.sendFile).toHaveBeenCalledWith('file.png', expect.objectContaining({ root: expect.any(String) }));
  });

  it('uploadScreenshot delega para uploadFromHttp com alunoId do token', async () => {
    mockScreenshotService.uploadFromHttp.mockResolvedValue(undefined);
    const body = { requestId: 'req-1', professorId: 'prof-uuid', imageBase64: 'abc' };

    await controller.uploadScreenshot(mockReq, body);

    expect(mockScreenshotService.uploadFromHttp).toHaveBeenCalledWith('prof-uuid', body);
  });

  it('getImage lança NotFoundException se screenshot não encontrado', async () => {
    mockScreenshotService.getImagePath.mockResolvedValue(null);
    const mockRes = { sendFile: vi.fn() };

    await expect(controller.getImage('nao-existe', mockRes)).rejects.toThrow(NotFoundException);
  });

  it('getStream retorna Observable do service', () => {
    const mockObservable = { subscribe: vi.fn() };
    mockScreenshotService.getStream.mockReturnValue(mockObservable);

    const result = controller.getStream(mockReq);
    expect(mockScreenshotService.getStream).toHaveBeenCalledWith('prof-uuid');
    expect(result).toBe(mockObservable);
  });

  it('getPending delega para getPendingRequest do service', async () => {
    mockScreenshotService.getPendingRequest.mockResolvedValue({ requestId: 'req-1', professorId: 'prof-uuid' });

    const result = await controller.getPending(mockReq);
    expect(mockScreenshotService.getPendingRequest).toHaveBeenCalledWith('prof-uuid');
    expect(result).toEqual({ requestId: 'req-1', professorId: 'prof-uuid' });
  });

  it('captureFailed chama notifyCaptureFailed no service', () => {
    controller.captureFailed({ professorId: 'prof-uuid', requestId: 'req-1' });
    expect(mockScreenshotService.notifyCaptureFailed).toHaveBeenCalledWith('prof-uuid', 'req-1');
  });
});
