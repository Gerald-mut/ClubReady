#!/usr/bin/env python3
"""Exercise runner transaction boundaries, bounded retries and safe logs."""
import contextlib
import importlib.util
import io
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('scheduler', Path(__file__).resolve().parents[1] / 'readiness/run.py')
scheduler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scheduler)


class SchedulerTests(unittest.TestCase):
    def invoke(self, values, cap=3):
        output = io.StringIO()
        with patch.object(scheduler, 'query', side_effect=values) as query, patch.object(scheduler.time, 'sleep'), contextlib.redirect_stdout(output):
            status = scheduler.run(cap, 45)
        return status, json.loads(output.getvalue()), query

    def test_null_does_not_stop_preparation(self):
        status, data, query = self.invoke(['', '', 'job', '{"failed":0}'])
        self.assertEqual((status, data['calls'], data['jobs_returned']), (0, 3, 1))
        self.assertEqual(query.call_count, 4)

    def test_failures_retry_within_cap_and_do_not_log_errors(self):
        status, data, _ = self.invoke([RuntimeError('SECRET'), subprocess.TimeoutExpired('SECRET', 1), '', '{"failed":0}'])
        self.assertEqual(status, 1)
        self.assertEqual(data['infrastructure_errors'], 2)
        self.assertNotIn('SECRET', json.dumps(data))

    def test_dead_jobs_fail_tick(self):
        self.assertEqual(self.invoke(['', '', '', '{"failed":1}'])[0], 1)

    def test_health_failure(self):
        status, data, _ = self.invoke(['', '', '', RuntimeError('SECRET')])
        self.assertEqual(status, 1)
        self.assertTrue(data['health_unavailable'])

    def test_budget_stops_calls(self):
        with patch.object(scheduler.time, 'monotonic', side_effect=[0, 45, 45]), patch.object(scheduler, 'query') as query, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(scheduler.run(), 1)
            query.assert_not_called()

    def test_fresh_psql_connection_and_timeouts(self):
        result = subprocess.CompletedProcess([], 0, 'job\n', '')
        with patch.object(scheduler.subprocess, 'run', return_value=result) as call:
            self.assertEqual(scheduler.query('select public.process_next_job();', 12), 'job')
        args, kwargs = call.call_args
        self.assertIn('-XAtqw', args[0])
        self.assertEqual(kwargs['timeout'], 12)
        self.assertIn('statement_timeout=10000', kwargs['env']['PGOPTIONS'])
        self.assertNotIn('BEGIN', args[0][-1])


if __name__ == '__main__':
    unittest.main()
