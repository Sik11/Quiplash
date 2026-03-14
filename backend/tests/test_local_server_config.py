import pathlib
import unittest


class LocalServerConfigTests(unittest.TestCase):
    def test_server_uses_port_env_and_public_host_binding(self):
        server_text = pathlib.Path('server.py').read_text()
        self.assertIn("port = int(os.environ.get('PORT', 8181))", server_text)
        self.assertIn("app.run(host='0.0.0.0', port=port", server_text)

    def test_procfile_points_to_local_server(self):
        procfile_text = pathlib.Path('Procfile').read_text().strip()
        self.assertEqual(procfile_text, 'web: python server.py')


if __name__ == '__main__':
    unittest.main()
