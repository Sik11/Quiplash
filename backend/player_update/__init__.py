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
    player = json.loads(input)
    p_username = player.get('username')
    p_game_increment = player.get('add_to_games_played')
    p_score_increment = player.get('add_to_score')
    logging.info("Buckle up, we got a request to update Player: {}".format(p_username))
    
    try:
            query = "SELECT * FROM p WHERE p.username = @username"
            parameters = [{"name": "@username", "value": p_username}]
            items = list(PlayerContainerProxy.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))

            # Check if a player was found and update the games played/scores played if so.
            if items:
                player = items[0]

                if player["games_played"] + p_game_increment > 0 : 
                    player["games_played"] += p_game_increment
                
                if player["total_score"] + p_score_increment > 0:
                    player["total_score"] += p_score_increment
               
                
                PlayerContainerProxy.replace_item(item=player, body=player)

                # Return a success response.
                return HttpResponse(
                    json.dumps({"result": True, "msg": "OK"}),
                    mimetype="application/json"
                )
            
            else:
                # No player found with that username
                return HttpResponse(
                    json.dumps({"result": False, "msg": "Player does not exist"}),
                    mimetype="application/json"
                )
            
    except CosmosHttpResponseError as e:
            logging.error('Cosmos DB response error occurred: {}'.format(e))
            return HttpResponse(
                json.dumps({"result": False, "msg": "An error occurred while querying the database"}),
                mimetype="application/json"
        )
