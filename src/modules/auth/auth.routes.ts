import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { authMiddleware, tenantMiddleware, exigirPapel } from '../../core/middlewares/tenant.middleware';

export const authRouter = Router();
const controller = new AuthController();

/**
 * Rate limit no login. Complementa a trava por usuario no banco (5 falhas =
 * 15 min de bloqueio), cobrindo tambem a varredura de e-mails a partir do
 * mesmo IP.
 */
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Excesso de tentativas de login. Tente novamente em 15 minutos.',
    code: 'RATE_LIMIT_LOGIN'
  }
});

authRouter.post('/login', limiteLogin, controller.login);
authRouter.post('/refresh', limiteLogin, controller.renovar);
authRouter.get('/me', authMiddleware, tenantMiddleware, controller.eu);

// Criacao de usuario e ato administrativo.
authRouter.post('/usuarios', authMiddleware, exigirPapel('Gestor_CLevel'), controller.criarUsuario);
