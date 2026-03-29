import unittest
import requests
import json
import logging 
# Take note of how we import modules from shared_code 
from shared_code.Player import Player,SmallPasswordError,SmallUsernameError,LargePasswordError,LargeUsernameError,NegativeGameCountError,NegativeScoreError
from azure.cosmos import CosmosClient 

class TestRegisterPlayerFunction(unittest.TestCase):   
    """
    This test set focuses on testing the responses from the server on the player register function, separated from tests of the base classes 
    """
    LOCAL_DEV_URL="http://localhost:7071/player/register"
    PUBLIC_URL="https://quiplash-oew1g21-2324.azurewebsites.net/player/register"
    TEST_URL = PUBLIC_URL
    # Sadly, tests don't have local.settings.json available as environment variables
    # Hence, we have to parse it manually
    with open('local.settings.json') as settings_file:
        settings = json.load(settings_file)
    MyCosmos = CosmosClient.from_connection_string(settings['Values']['AzureCosmosDBConnectionString'])
    QuipLashDBProxy = MyCosmos.get_database_client(settings['Values']['Database'])
    PlayerContainerProxy = QuipLashDBProxy.get_container_client(settings['Values']['PlayerContainer'])
    Key = settings['Values']['FunctionAppKey']

    # A valid Player  
    player = {
        "username": "testuser",
        "password": "testpassword"
    }
    json_player = json.dumps(player)
    
    
    #invalid Players
    player_su = {
        "username": "tes",
        "password": "testpassword"
    }
    json_player_su = json.dumps(player_su)
    player_u_bound = {
        "username": "test",
        "password": "testpassword"
    }
    json_player_u_bound = json.dumps(player_u_bound)
    player_p_bound = {
        "username":"testy",
        "password":"0123456789"
    }
    json_player_p_bound = json.dumps(player_p_bound)
    player_sp = {
        "username": "testuser1",
        "password": "test"
    }
    json_player_sp = json.dumps(player_sp)
    json_player_lu = json.dumps({
        "username": "testuser"*10,
        "password": "testpassword"
    })
    json_player_lp = json.dumps({
        "username": "testuser3",
        "password": "testpassword"*10
    })

    def test_is_valid_correct(self):
       #note we use data instead of params as we want to send json
       #https://requests.readthedocs.io/en/latest/user/quickstart/#more-complicated-post-requests
       print("\n Sending request: {}".format(self.json_player))
       response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player)
       
       # the below decodes json that we expect as response
       #https://requests.readthedocs.io/en/latest/user/quickstart/#json-response-content
       dict_response = response.json()
       print("Received response: {}".format(dict_response))    

       self.assertTrue(dict_response['result'])
       self.assertEqual(dict_response['msg'],'OK')
       self.assertEqual(response.status_code,200)
   
    def test_player_exists(self):
        print("\n Sending request to add player again: {}".format(self.json_player))
        response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player)

        dict_response = response.json()
        print("Received response: {}".format(dict_response))    

        self.assertFalse(dict_response['result'])
        self.assertEqual(dict_response['msg'],'Username already exists')
        # self.assertEqual(response.status_code,200)
      
       
    def test_username_boundary(self):
        print("\n Sending request to add player: {}".format(self.json_player_u_bound))
        response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player_u_bound)
        dict_response = response.json()
        print("Received response: {}".format(dict_response))
        self.assertTrue(dict_response['result'])
        self.assertEqual(dict_response['msg'],'OK')
        self.assertEqual(response.status_code,200)
    
    def test_short_username(self):
        print("\n Sending request to add player: {}".format(self.json_player_su))
        response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player_su)
        dict_response = response.json()
        print("Received response: {}".format(dict_response))
        self.assertFalse(dict_response['result'])
        self.assertEqual(dict_response['msg'],'Username less than 4 characters or more than 14 characters')
    
    def test_long_username(self):
        print("\n Sending request to add player: {}".format(self.json_player_lu))
        response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player_lu)
        dict_response = response.json()
        print("Received response: {}".format(dict_response))
        self.assertFalse(dict_response['result'])
        self.assertEqual(dict_response['msg'],'Username less than 4 characters or more than 14 characters')
    
    def test_password_boundary(self):
        print("\n Sending request to add player: {}".format(self.json_player_p_bound))
        response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player_p_bound)
        dict_response = response.json()
        print("Received response: {}".format(dict_response))
        self.assertTrue(dict_response['result'])
        self.assertEqual(dict_response['msg'],'OK')
        self.assertEqual(response.status_code,200)
    
    def test_short_password(self):
        print("\n Sending request to add player: {}".format(self.json_player_sp))
        response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player_sp)
        dict_response = response.json()
        print("Received response: {}".format(dict_response))
        self.assertFalse(dict_response['result'])
        self.assertEqual(dict_response['msg'],'Password less than 10 characters or more than 20 characters')

    def test_long_password(self):
        print("\n Sending request to add player: {}".format(self.json_player_lp))
        response = requests.post(self.TEST_URL,params={"code": "{}".format(self.Key)},data=self.json_player_lp)
        dict_response = response.json()
        print("Received response: {}".format(dict_response))
        self.assertFalse(dict_response['result'])
        self.assertEqual(dict_response['msg'],'Password less than 10 characters or more than 20 characters')

    # @classmethod
    # def tearDownClass(cls):
    #     # This will run once after all tests in this class are executed
    #     # Use the read_all_items() method of ContainerProxy to delete all items in the container
    #     for doc in cls.PlayerContainerProxy.read_all_items():
    #             cls.PlayerContainerProxy.delete_item(item=doc, partition_key=doc['id'])