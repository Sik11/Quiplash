from cgi import test
import unittest
import requests
import json
import logging 
# Take note of how we import modules from shared_code 
from shared_code.Player import Player,SmallPasswordError,SmallUsernameError,LargePasswordError,LargeUsernameError,NegativeGameCountError,NegativeScoreError
from azure.cosmos import CosmosClient 

class TestCreatePromptFunction(unittest.TestCase):   
    """
    This test set focuses on testing the responses from the server on the player register function, separated from tests of the base classes 
    """
    LOCAL_DEV_URL="http://localhost:7071/prompt/create" 
    PUBLIC_URL="https://quiplash-oew1g21-2324.azurewebsites.net/prompt/create"
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
        "text": "Hey I am a very cute boy blah blah"
    })

    p1_pr2 = json.dumps({
        "username":"testy",
        "text": "I can be whoever i want"
    })

    p2 = json.dumps({
        "username": "testuser",
        "text":"You are an idiot"
    })

    p2_pr2 = json.dumps({
        "username": "testuser",
        "text":"The idiot tricked me"
    })

    p1_pr3 = json.dumps({
        "username":"testy",
        "text":"idiots! All of them"
    })

    p1_pr4 = json.dumps({
        "username":"testy",
        "text":"idiot is what you are"
    })



    p1_french = json.dumps({
        "username":"testy",
        "text": "Bonjour je suis un garçon très mignon blah blah"
    })
    
    p1_numbers = json.dumps({
        "username":"testy",
        "text": "123456789011121131415"
    })

    p1_short = json.dumps({
        "username":"testy",
        "text": "Hey"
    })

    p1_long = json.dumps({
        "username":"testy",
        "text":"Hey"*80
    })
    p2_unknown = json.dumps({
        "username":"sikii1",
        "text":"Hey, i'm young, wild and free"
    })

    def test_user_1(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1,
        )

        self.assertTrue(response.json()['result'])
        self.assertEqual(response.json()['msg'], "OK")
    
    def test_user1_prompt2(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1_pr2,
        )

        self.assertTrue(response.json()['result'])
        self.assertEqual(response.json()['msg'], "OK")
    
    def test_user_2(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p2,
        )

        self.assertTrue(response.json()['result'])
        self.assertEqual(response.json()['msg'], "OK")
    
    def test_user2_prompt2(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p2_pr2,
        )

        self.assertTrue(response.json()['result'])
        self.assertEqual(response.json()['msg'], "OK")
    
    def test_user1_prompt3(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1_pr3,
        )

        self.assertTrue(response.json()['result'])
        self.assertEqual(response.json()['msg'], "OK")
    
    def test_user1_prompt4(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1_pr4,
        )

        self.assertTrue(response.json()['result'])
        self.assertEqual(response.json()['msg'], "OK")
    
    def test_user_unsupported_lang(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1_french,
        )
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'], "Unsupported language")
    
    def test_user_low_detection_score(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1_numbers,
        )
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'], "Unsupported language")
    
    def test_user_short_text(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1_short,
        )
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'], "Prompt less than 15 characters or more than 80 characters")
    
    def test_user_long_text(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p1_long,
        )
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'], "Prompt less than 15 characters or more than 80 characters")
    
    def test_nonexistent_player(self):
        response = requests.post(
            url=self.TEST_URL,
            params={"code": "{}".format(self.Key)},
            json=self.p2_unknown,
        )
        self.assertFalse(response.json()['result'])
        self.assertEqual(response.json()['msg'], "Player does not exist")
    