from cgi import test
import unittest
import requests
import json
import logging 
# Take note of how we import modules from shared_code 
from shared_code.Player import Player,SmallPasswordError,SmallUsernameError,LargePasswordError,LargeUsernameError,NegativeGameCountError,NegativeScoreError
from azure.cosmos import CosmosClient 

class TestDeletePromptFunction(unittest.TestCase):   
    """
    This test set focuses on testing the responses from the server on the player register function, separated from tests of the base classes 
    """
    LOCAL_DEV_URL="http://localhost:7071/prompt/delete" 
    PUBLIC_URL="https://quiplash-oew1g21-2324.azurewebsites.net/prompt/delete"
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
        "player":"testuser"
    })

    w1 = json.dumps({
        "word":"idiot"
    })

    def test_delete_prompt_p1(self):
        """
        Test the delete prompt function
        """

        # Delete the prompt
        response = requests.post(url = self.TEST_URL, params={"code": "{}".format(self.Key)}, json=self.p1)
        print(response.json())
        self.assertTrue(response.json()["result"])
        self.assertEqual(response.json()["msg"], "2 prompts deleted")

        # Check that the prompt is deleted
        # response = requests.post(url = self.TEST_URL, params={"code": "{}".format(self.Key)}, json=self.p1) 
        # self.assertEqual(response.json()["result"], False)
        # self.assertEqual(response.json()["msg"], "Prompt not found for deletion")
    
    def test_delete_prompt_w1(self):
        """
        Test the delete prompt function
        """

        # Delete the prompt
        response = requests.post(url = self.TEST_URL, params={"code": "{}".format(self.Key)}, json=self.w1)
        print(response.json())
        self.assertTrue(response.json()["result"])
        self.assertEqual(response.json()["msg"], "1 prompts deleted")

        # Check that the prompt is deleted
        # response = requests.post(url = self.TEST_URL, params={"code": "{}".format(self.Key)}, json=self.w1) 
        # self.assertEqual(response.json()["result"], False)
        # self.assertEqual(response.json()["msg"], "Prompt not found for deletion")