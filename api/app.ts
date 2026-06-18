import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import { fileURLToPath } from 'url'
import { initDatabase } from './db/index.js'
import authRoutes from './routes/auth.js'
import technicianRoutes from './routes/technicians.js'
import orderRoutes from './routes/orders.js'
import approvalRoutes from './routes/approvals.js'
import reportRoutes from './routes/reports.js'
import conflictRoutes from './routes/conflicts.js'
import dispatchRuleRoutes from './routes/dispatch-rules.js'
import afterSaleRoutes from './routes/after-sale.js'
import knowledgeRoutes from './routes/knowledge.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

initDatabase().then(() => {
  console.log('Database initialized')
}).catch((err) => {
  console.error('Database initialization failed:', err)
})

app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use(session({
  secret: process.env.SESSION_SECRET || 'work-order-dispatch-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  },
}))

app.use('/api/auth', authRoutes)
app.use('/api/technicians', technicianRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/approvals', approvalRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/conflicts', conflictRoutes)
app.use('/api/dispatch-rules', dispatchRuleRoutes)
app.use('/api/after-sale', afterSaleRoutes)
app.use('/api/knowledge', knowledgeRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: error.message || 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
