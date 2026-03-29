from cgi import test
import unittest
import requests
import json
import logging 
# Take note of how we import modules from shared_code 
from shared_code.Player import Player,SmallPasswordError,SmallUsernameError,LargePasswordError,LargeUsernameError,NegativeGameCountError,NegativeScoreError
from azure.cosmos import CosmosClient 

class TestUpdatePlayerFunction(unittest.TestCase):   
    """
    This test set focuses on testing the responses from the server on the player register function, separated from tests of the base classes 
    """
    LOCAL_DEV_URL="http://localhost:7071/player/update" 
    PUBLIC_URL="https://quiplash-oew1g21-2324.azurewebsites.net/player/update"
    TEST_URL = PUBLIC_URL
    # Sadly, tests don't have local.settings.json available as environment variables
    # Hence, we have to parse it manually
    with open('local.settings.json') as settings_file:
        settings = json.load(settings_file)
    MyCosmos = CosmosClient.from_connection_string(settings['Values']['AzureCosmosDBConnectionString'])
    QuipLashDBProxy = MyCosmos.get_database_client(settings['Values']['Database'])
    PlayerContainerProxy = QuipLashDBProxy.get_container_client(settings['Values']['PlayerContainer'])
    Key = settings['Values']['FunctionAppKey']

    p1 = json.dumps({
        "username":"testy",
        "password":"0123456789",
        "add_to_games_played": 6,
        "add_to_score": 5
    })
    p2 = json.dumps({
        "username": "testuser",
        "password": "testpassword",
        "add_to_games_played": 6,
        "add_to_score": 5
    })
    p3 = json.dumps({
        "username": "testuser1",
        "password": "testpassword",
        "add_to_games_played": 6,
        "add_to_score": 5
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

    def test_successful_update_p1(self):
        """
        Test that the server returns a success response when updating player 1
        """

        # Send a request to the server to update player 1.
        response = requests.put(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1,
        )

        # Check that the response is a success response.
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"result": True, "msg": "OK"})

        # Check that the player was updated in the database.
        # player = self.PlayerContainerProxy.read_item(item="1", partition_key="1")
        # self.assertEqual(player["games_played"], 6)
        # self.assertEqual(player["total_score"], 5)

        self.write_players_to_file()
    
    def test_successful_update_p2(self):
        """
        Test that the server returns a success response when updating player 2
        """

        # Send a request to the server to update player 2.
        response = requests.put(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p2,
        )

        # Check that the response is a success response.
        # self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['result'])
        self.assertEqual(response.json()['msg'],"OK")

        # Check that the player was updated in the database.
        # player = self.PlayerContainerProxy.read_item(item="2", partition_key="2")
        # self.assertEqual(player["games_played"], 6)
        # self.assertEqual(player["total_score"], 5)

        self.write_players_to_file()
    
    def test_unsuccessful_update_p3(self):
        """
        Test that the server returns a failure response when updating player 3
        """

        # Send a request to the server to update player 3.
        response = requests.put(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p3,
        )

        # Check that the response is a failure response.
        self.assertEqual(response.json(), {"result": False, "msg": "Player does not exist"})

        self.write_players_to_file()