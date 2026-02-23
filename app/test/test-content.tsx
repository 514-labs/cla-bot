"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SiteHeader } from "@/components/site-header"
import { Loader2, Play, CheckCircle2, XCircle, Clock } from "lucide-react"

type TestResult = {
  name: string
  passed: boolean
  error?: string
  duration: number
}

type TestResponse = {
  summary: {
    total: number
    passed: number
    failed: number
    duration: number
  }
  results: TestResult[]
}

export default function TestContent() {
  const [data, setData] = useState<TestResponse | null>(null)
  const [running, setRunning] = useState(false)

  async function runTests() {
    setRunning(true)
    setData(null)
    try {
      const res = await fetch("/api/run-tests")
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    }
    setRunning(false)
  }

  const summary = data?.summary
  const results = data?.results ?? []

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                End-to-End Tests
              </h1>
              <p className="mt-1 text-muted-foreground">
                Run all API integration tests against the mock database.
              </p>
            </div>
            <Button
              onClick={runTests}
              disabled={running}
              className="gap-2"
              size="lg"
              data-testid="run-tests-btn"
            >
              {running ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-5 w-5" />
              )}
              {running ? "Running..." : "Run All Tests"}
            </Button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold text-foreground" data-testid="total-count">
                    {summary.total}
                  </p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold text-primary" data-testid="passed-count">
                    {summary.passed}
                  </p>
                  <p className="text-xs text-muted-foreground">Passed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold text-destructive" data-testid="failed-count">
                    {summary.failed}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{summary.duration}ms</p>
                  <p className="text-xs text-muted-foreground">Duration</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {results.map((result, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 rounded-lg px-4 py-3 transition-colors ${
                        result.passed ? "hover:bg-secondary" : "bg-destructive/5"
                      }`}
                      data-testid="test-result"
                      data-passed={result.passed}
                    >
                      {result.passed ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{result.name}</p>
                        {result.error && (
                          <p className="mt-1 font-mono text-xs text-destructive">{result.error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {result.duration}ms
                        </span>
                        <Badge
                          variant={result.passed ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {result.passed ? "PASS" : "FAIL"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!data && !running && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <Play className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mb-1 text-lg font-semibold text-foreground">No tests run yet</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Click &quot;Run All Tests&quot; to execute the full end-to-end test suite against
                  the mock database API routes.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
