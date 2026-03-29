from cgi import test
import unittest
import requests
import json
import logging 
# Take note of how we import modules from shared_code 
from shared_code.Player import Player,SmallPasswordError,SmallUsernameError,LargePasswordError,LargeUsernameError,NegativeGameCountError,NegativeScoreError
from azure.cosmos import CosmosClient 

class TestLoginPlayerFunction(unittest.TestCase):   
    """
    This test set focuses on testing the responses from the server on the player register function, separated from tests of the base classes 
    """
    LOCAL_DEV_URL="http://localhost:7071/player/login"
    PUBLIC_URL="https://quiplash-oew1g21-2324.azurewebsites.net/player/login"
    TEST_URL = LOCAL_DEV_URL
    # Sadly, tests don't have local.settings.json available as environment variables
    # Hence, we have to parse it manually
    with open('local.settings.json') as settings_file:
        settings = json.load(settings_file)
    MyCosmos = CosmosClient.from_connection_string(settings['Values']['AzureCosmosDBConnectionString'])
    QuipLashDBProxy = MyCosmos.get_database_client(settings['Values']['Database'])
    PlayerContainerProxy = QuipLashDBProxy.get_container_client(settings['Values']['PlayerContainer'])
    Key = settings['Values']['FunctionAppKey']

    json_player_1 = '{"username":"testy","password":"0123456789"}'
    json_player_2 = json.dumps({
        "username": "testuser",
        "password": "testpassword"
    })
    json_p1_wrongpass = json.dumps({
        "username": "siki",
        "password": "01234567890"
    })
    p1_wronguser = {
        "username": "sik",
        "password": "0123456789"
    }
    json_p1_wronguser = json.dumps(p1_wronguser)
    json_p2_wrongpass = json.dumps({
        "username": "testuser",
        "password": "testpassword1"
    })
    json_p2_wronguser = json.dumps({
        "username": "testuse",
        "password": "testpassword"
    })
    json_p3_wronguser_wrongpass = json.dumps({
        "username": "testuser1",
        "password": "testpassword1"
    })
    json_p3_wronguser_rightpass = json.dumps({
        "username": "testuser1",
        "password": "testpassword"
    })

    def write_players_to_file(self):
        try:
            # Query all items in the Player container.
            players = self.PlayerContainerProxy.query_items(
                query="SELECT * FROM p",
                enable_cross_partition_query=True
            )
            logging.info(players)

            # Build a list of dictionaries with just the username and password.
            simplified_players = [{"username": player["username"], "password": player["password"],"games_played": player["games_played"],"total_score":player["total_score"]} for player in players]

            # Write this list to a file as JSON.
            with open('tests/players.json', 'w') as outfile:
                json.dump(simplified_players, outfile, indent=4)

            logging.info("Players have been written to 'players.json'.")

        except Exception as e:
            logging.error("An error occurred while writing players to file: {}".format(e))
    
    def setUp(self):
        self.write_players_to_file()

    def test_successful_login_p2(self):
        """
        Tests that a player can be successfully logged in
        """

        login_response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_player_2)
        self.assertEqual(login_response.json()['result'],True)
        self.assertEqual(login_response.json()['msg'],"OK")
    
    def test_successful_login_p1(self):
        """
        Tests that a player can be successfully logged in
        """

        login_response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_player_1)
        self.assertTrue(login_response.json()['result'])
        self.assertEqual(login_response.json()['msg'],"OK") 
    
    def test_wrongpass_p1(self):
        response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_p1_wrongpass)
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'],"Username or password incorrect")
    
    def test_wronguser_p1(self):
        response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_p1_wronguser)
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'],"Username or password incorrect")

    def test_wrongpass_p2(self):
        response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_p2_wrongpass)
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'],"Username or password incorrect")
    
    def test_wronguser_p2(self):
        response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_p2_wronguser)
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'],"Username or password incorrect")
    
    def test_wronguser_wrongpass_p3(self):
        response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_p3_wronguser_wrongpass)
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'],"Username or password incorrect")
    
    def test_wronguser_rightpass_p3(self):
        response = requests.get(self.TEST_URL,params={"code": "{}".format(self.Key)},json=self.json_p3_wronguser_rightpass)
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'],"Username or password incorrect")
    

    


