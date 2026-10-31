import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import { Spinner } from './components/ui'
import ErrorBoundary from './components/ErrorBoundary'
import { useLanguage } from './i18n/LanguageContext'

// Home is the most common landing page, so it stays a normal (eager) import -
// no loading flicker for the majority of visits. Every other page is only
// ever needed after a click, so it's fetched on demand instead of bloating
// the bundle every visitor downloads just to see the Overview page.
const Monthly = lazy(() => import('./pages/Monthly'))
const Register = lazy(() => import('./pages/Register'))
const MemberProfile = lazy(() => import('./pages/MemberProfile'))
const PlayerCard = lazy(() => import('./pages/PlayerCard'))
const Collection = lazy(() => import('./pages/Collection'))
const Speedrun = lazy(() => import('./pages/Speedrun'))
const Events = lazy(() => import('./pages/Events'))
const Quests = lazy(() => import('./pages/Quests'))
const RankedQueue = lazy(() => import('./pages/RankedQueue'))
const History = lazy(() => import('./pages/History'))
const Donate = lazy(() => import('./pages/Donate'))
const Metrics = lazy(() => import('./pages/Metrics'))
const GameNights = lazy(() => import('./pages/GameNights'))
const Clan = lazy(() => import('./pages/Clan'))
const Archive = lazy(() => import('./pages/Archive'))
const Reports = lazy(() => import('./pages/Reports'))
const Survey = lazy(() => import('./pages/Survey'))
const SurveyResults = lazy(() => import('./pages/SurveyResults'))

function NotFound() {
  const { t } = useLanguage()
  // The server answers every unknown URL with the SPA shell (HTTP 200), so tell
  // crawlers this one is not a real page.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
  return (
    <div className="py-20 text-center">
      <h1 className="font-display text-3xl font-bold text-white">404</h1>
      <p className="mt-2 text-slate-400">{t.notFound.body}</p>
      <Link to="/" className="btn-accent mt-6 inline-flex">
        {t.notFound.button}
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/monthly/ffa" element={<Monthly variant="ffa" />} />
            <Route path="/monthly/team" element={<Monthly variant="team" />} />
            <Route path="/ranked/1v1" element={<Monthly variant="1v1" />} />
            <Route path="/ranked/2v2" element={<Monthly variant="2v2" />} />
            <Route path="/ranked/ffa" element={<Monthly variant="rffa" />} />
            <Route path="/monthly/1v1" element={<Navigate to="/ranked/1v1" replace />} />
            <Route path="/monthly/2v2" element={<Navigate to="/ranked/2v2" replace />} />
            <Route path="/member/:id" element={<MemberProfile />} />
            <Route path="/card/:id?" element={<PlayerCard />} />
            <Route path="/collection/:id?" element={<Collection />} />
            <Route path="/speedrun" element={<Speedrun />} />
            <Route path="/events" element={<Events />} />
            <Route path="/quests" element={<Quests />} />
            <Route path="/planner" element={<Navigate to="/monthly/team" replace />} />
            <Route path="/queue" element={<RankedQueue />} />
            <Route path="/trends" element={<Navigate to="/" replace />} />
            <Route path="/history" element={<History />} />
            <Route path="/donate" element={<Donate />} />
            <Route path="/register" element={<Register />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/game-nights" element={<GameNights />} />
            <Route path="/clan" element={<Clan />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/survey" element={<Survey />} />
            <Route path="/survey/results" element={<SurveyResults />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  )
}
