import logging
import json

from azure.functions import HttpRequest, HttpResponse
from shared_code.Player import Player,SmallPasswordError,SmallUsernameError,LargePasswordError,LargeUsernameError,NegativeGameCountError,NegativeScoreError

import os

from azure.cosmos import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError,CosmosResourceExistsError,CosmosResourceNotFoundError

# ProxyObjects to account, database and container respectively.
# API reference here
MyCosmos = CosmosClient.from_connection_string(os.environ['AzureCosmosDBConnectionString'])
QuipLashDBProxy = MyCosmos.get_database_client(os.environ['Database'])
PlayerContainerProxy = QuipLashDBProxy.get_container_client(os.environ['PlayerContainer'])

def main(req: HttpRequest) -> HttpResponse:

    input = req.get_json()
    logging.info('Buckle up, we got a request to register a player from this {}'.format(input))

    input_player = Player()

    try:
        input_player.from_dict(input)
    
    except ValueError:
        logging.info("Value Error caught from input {}".format(input))
        response_body = json.dumps({
            "result": False,
            "msg": "Input JSON is not from a Player"
        })
        return HttpResponse(body=response_body,mimetype="application/json")

    
    try:
        query = "SELECT * FROM p WHERE p.username = @username"
        parameters = [{"name":"@username","value":input_player.username}]
        query_results = list(PlayerContainerProxy.query_items(query=query,parameters=parameters,enable_cross_partition_query=True))
        logging.info("Query results: {}".format(query_results))
        if query_results:
            response_body = json.dumps({
                "result": False,
                "msg": "Username already exists"
            })
            
            return HttpResponse(body=response_body,mimetype="application/json")
    
    except CosmosHttpResponseError as e:
        logging.error("Cosmos DB Error: {}".format(e))
        return HttpResponse(json.dumps({"result": False, "msg": "An error occured"}))
    
    except Exception as e:
        logging.error("Unexpected Error: {}".format(e))
        return HttpResponse(json.dumps({"result":False,"msg": "An error occured"}))


    try:
        if input_player.is_valid():
            PlayerContainerProxy.create_item(input_player.to_dict(),enable_automatic_id_generation=True)
            response_body = json.dumps({
                "result": True,
                "msg": "OK"
            })
            return HttpResponse(body=response_body,mimetype="application/json")
    
    except (SmallUsernameError,LargeUsernameError):
        response_body = json.dumps({
            "result": False,
            "msg":"Username less than 4 characters or more than 14 characters"
        })
        return HttpResponse (body=response_body,mimetype="application/json")
    
    except (SmallPasswordError,LargePasswordError):
        response_body = json.dumps({
            "result": False,
            "msg":"Password less than 10 characters or more than 20 characters"
        })
        return HttpResponse (body=response_body,mimetype="application/json")
