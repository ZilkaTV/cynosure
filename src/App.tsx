import { Routes, Route, Link } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Monthly from './pages/Monthly'
import Register from './pages/Register'

function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="font-display text-3xl font-bold text-white">404</h1>
      <p className="mt-2 text-slate-400">This page drifted off the star chart.</p>
      <Link to="/" className="btn-accent mt-6 inline-flex">
        Back to overview
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/monthly/ffa" element={<Monthly variant="ffa" />} />
        <Route path="/monthly/team" element={<Monthly variant="team" />} />
        <Route path="/monthly/1v1" element={<Monthly variant="1v1" />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}
