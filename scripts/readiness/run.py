#!/usr/bin/env python3
"""Bounded readiness tick. Connection credentials come exclusively from libpq."""
import argparse
import json
import os
import subprocess
import time


def query(sql, timeout):
    env = dict(os.environ)
    env['PGAPPNAME'] = 'clubready-readiness'
    env['PGCONNECT_TIMEOUT'] = '5'
    # Override inherited options; a fresh backend owns exactly one transaction.
    env['PGOPTIONS'] = '-c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=5000'
    result = subprocess.run(
        ['psql', '-XAtqw', '-v', 'ON_ERROR_STOP=1', '-c', sql],
        env=env, capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode:
        # stderr can include connection details or database contents.
        raise RuntimeError('database_call_failed')
    return result.stdout.strip()


def run(max_calls=40, budget=45):
    deadline = time.monotonic() + budget
    calls = returned = errors = 0
    while calls < max_calls and deadline - time.monotonic() > 1:
        calls += 1
        try:
            value = query('select public.process_next_job();', min(12, deadline - time.monotonic()))
            returned += bool(value)
        except (RuntimeError, subprocess.TimeoutExpired, OSError):
            errors += 1
            # Retry only on a new connection/transaction, and within both caps.
            time.sleep(min(.25, max(0, deadline - time.monotonic())))
        # NULL is not exhaustion: bounded preparation can still have work.
    summary = dict(calls=calls, jobs_returned=returned, infrastructure_errors=errors)
    try:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('budget_exhausted')
        summary['queue'] = json.loads(query('select public.readiness_health();', min(12, remaining)))
    except (RuntimeError, subprocess.TimeoutExpired, OSError, ValueError):
        summary['health_unavailable'] = True
    print(json.dumps(summary, sort_keys=True))
    # A returned UUID can mean a retry or permanent failure; health is authoritative.
    return int(bool(errors or summary.get('health_unavailable') or summary.get('queue', {}).get('failed', 0)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-calls', type=int, default=40, choices=range(1, 1001), metavar='1..1000')
    parser.add_argument('--budget', type=int, default=45, choices=range(1, 51), metavar='1..50')
    args = parser.parse_args()
    raise SystemExit(run(args.max_calls, args.budget))
