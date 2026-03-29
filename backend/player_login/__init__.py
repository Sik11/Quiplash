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
    logging.info(req.url)
    input = req.get_json()
    player = json.loads(input)
    logging.info("Buckle up, we got a request to login a player: {}".format(player))
    p_username = player.get('username')
    p_password = player.get('password')

    try:
            query = "SELECT * FROM p WHERE p.username = @username"
            parameters = [{"name": "@username", "value": p_username}]
            items = list(PlayerContainerProxy.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))

            # Check if a player was found and if the password matches.
            if items and items[0]['password'] == p_password:
                # Password matches, return success response.
                return HttpResponse(
                    json.dumps({"result": True, "msg": "OK"}),
                    mimetype="application/json"
                )
            else:
                # No player found with that username or password does not match.
                return HttpResponse(
                    json.dumps({"result": False, "msg": "Username or password incorrect"}),
                    mimetype="application/json"
                )
            
    except CosmosHttpResponseError as e:
            logging.error('Cosmos DB response error occurred: {}'.format(e))
            return HttpResponse(
                json.dumps({"result": False, "msg": "An error occurred while querying the database"}),
                mimetype="application/json"
            )
    
    






