import os
import tempfile
import unittest
from tinydb import TinyDB

import server


class LocalServerEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)

        self.original_db = server.db
        self.original_players = server.players_table
        self.original_prompts = server.prompts_table

        db_path = os.path.join(self.tempdir.name, 'local_db.json')
        server.db = TinyDB(db_path)
        server.players_table = server.db.table('players')
        server.prompts_table = server.db.table('prompts')
        self.client = server.app.test_client()

    def tearDown(self):
        server.db.close()
        server.players_table = self.original_players
        server.prompts_table = self.original_prompts
        server.db = self.original_db

    def test_register_login_update_and_leaderboard(self):
        register = self.client.post('/player/register', json={
            'username': 'localuser',
            'password': 'Passw0rd1234'
        })
        self.assertEqual(register.status_code, 200)
        self.assertTrue(register.get_json()['result'])

        duplicate = self.client.post('/player/register', json={
            'username': 'localuser',
            'password': 'Passw0rd1234'
        })
        self.assertFalse(duplicate.get_json()['result'])

        login = self.client.post('/player/login', json={
            'username': 'localuser',
            'password': 'Passw0rd1234'
        })
        self.assertTrue(login.get_json()['result'])

        bad_login = self.client.post('/player/login', json={
            'username': 'localuser',
            'password': 'wrongpassword'
        })
        self.assertFalse(bad_login.get_json()['result'])

        update = self.client.post('/player/update', json={
            'username': 'localuser',
            'add_to_games_played': 2,
            'add_to_score': 500
        })
        self.assertTrue(update.get_json()['result'])

        leaderboard = self.client.get('/leaderboard', json={'top': 10})
        leaderboard_json = leaderboard.get_json()
        self.assertEqual(leaderboard.status_code, 200)
        self.assertEqual(leaderboard_json[0]['username'], 'localuser')
        self.assertEqual(leaderboard_json[0]['games_played'], 2)
        self.assertEqual(leaderboard_json[0]['total_score'], 500)

    def test_prompt_create_get_and_delete(self):
        self.client.post('/player/register', json={
            'username': 'promptuser',
            'password': 'Passw0rd1234'
        })

        create_prompt = self.client.post('/prompt/create', json={
            'username': 'promptuser',
            'text': 'This is a sufficiently long prompt for local tests.'
        })
        self.assertTrue(create_prompt.get_json()['result'])

        prompts = self.client.get('/utils/get', json={
            'players': ['promptuser'],
            'language': 'en'
        })
        prompts_json = prompts.get_json()
        self.assertEqual(len(prompts_json), 1)
        self.assertEqual(prompts_json[0]['username'], 'promptuser')

        delete_prompt = self.client.delete('/prompt/delete', json={'player': 'promptuser'})
        self.assertTrue(delete_prompt.get_json()['result'])

        prompts_after_delete = self.client.get('/utils/get', json={
            'players': ['promptuser'],
            'language': 'en'
        })
        self.assertEqual(prompts_after_delete.get_json(), [])


if __name__ == '__main__':
    unittest.main()
