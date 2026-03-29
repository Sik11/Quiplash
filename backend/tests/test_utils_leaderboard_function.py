from cgi import test
import unittest
import requests
import json
import logging 
# Take note of how we import modules from shared_code 
from shared_code.Player import Player,SmallPasswordError,SmallUsernameError,LargePasswordError,LargeUsernameError,NegativeGameCountError,NegativeScoreError
from azure.cosmos import CosmosClient

class TestUtilsLeaderboardFunction(unittest.TestCase):
    """
    This test set focuses on testing the responses from the server on the player register function, separated from tests of the base classes 
    """
    LOCAL_DEV_URL="http://localhost:7071/utils/leaderboard" 
    PUBLIC_URL="https://quiplash-oew1g21-2324.azurewebsites.net/utils/leaderboard"
    TEST_URL = PUBLIC_URL
    # Sadly, tests don't have local.settings.json available as environment variables
    # Hence, we have to parse it manually
    with open('local.settings.json') as settings_file:
        settings = json.load(settings_file)
    MyCosmos = CosmosClient.from_connection_string(settings['Values']['AzureCosmosDBConnectionString'])
    QuipLashDBProxy = MyCosmos.get_database_client(settings['Values']['Database'])
    PlayerContainerProxy = QuipLashDBProxy.get_container_client(settings['Values']['PlayerContainer'])
    Key = settings['Values']['FunctionAppKey']

    input1 = json.dumps({
        "top":"5"
    })

    input2 = json.dumps({
        "top":"6"
    })

    def test_input1(self):
        """
        Test the get function
        """

        # Get the prompt
        response = requests.get(url = self.TEST_URL, params={"code": "{}".format(self.Key)}, json=self.input1)
        print(response.json())
        self.assertEqual(response.json(),[ 
            {"username": "X-player", "games_played" : 50, "total_score": 100} ,
            {"username": "D-player", "games_played" : 10, "total_score": 80} ,
            {"username": "C-player", "games_played" : 20, "total_score": 80} ,
            {"username": "A-player", "games_played" : 10, "total_score": 40} ,
            {"username": "B-player", "games_played" : 10, "total_score": 40} 
            ])
    
    def test_input2(self):
        """
        Test the get function
        """

        # Get the prompt
        response = requests.get(url = self.TEST_URL, params={"code": "{}".format(self.Key)}, json=self.input2)
        print(response.json())
        self.assertEqual(response.json(),[ 
            {"username": "X-player", "games_played" : 50, "total_score": 100} ,
            {"username": "D-player", "games_played" : 10, "total_score": 80} ,
            {"username": "C-player", "games_played" : 20, "total_score": 80} ,
            {"username": "A-player", "games_played" : 10, "total_score": 40} ,
            {"username": "B-player", "games_played" : 10, "total_score": 40} ,
            {"username": "Y-player", "games_played" : 10, "total_score": 40}
            ])
        