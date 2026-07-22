import { lazy, Suspense } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import { Spinner } from './components/ui'
import { useLanguage } from './i18n/LanguageContext'

// Home is the most common landing page, so it stays a normal (eager) import -
// no loading flicker for the majority of visits. Every other page is only
// ever needed after a click, so it's fetched on demand instead of bloating
// the bundle every visitor downloads just to see the Overview page.
const Monthly = lazy(() => import('./pages/Monthly'))
const Register = lazy(() => import('./pages/Register'))
const MemberProfile = lazy(() => import('./pages/MemberProfile'))
const Speedrun = lazy(() => import('./pages/Speedrun'))
const Events = lazy(() => import('./pages/Events'))
const Quests = lazy(() => import('./pages/Quests'))
const AdminHelp = lazy(() => import('./pages/AdminHelp'))

function NotFound() {
  const { t } = useLanguage()
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
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/monthly/ffa" element={<Monthly variant="ffa" />} />
          <Route path="/monthly/team" element={<Monthly variant="team" />} />
          <Route path="/monthly/1v1" element={<Monthly variant="1v1" />} />
          <Route path="/member/:id" element={<MemberProfile />} />
          <Route path="/speedrun" element={<Speedrun />} />
          <Route path="/events" element={<Events />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin/help" element={<AdminHelp />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
