import logging
import json
import uuid
import requests

from azure.functions import HttpRequest, HttpResponse
from shared_code.Prompt import Prompt

import os

from azure.cosmos import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError,CosmosResourceExistsError,CosmosResourceNotFoundError
from azure.ai.translation.text import TextTranslationClient,TranslatorCredential
from azure.ai.translation.text.models import InputTextItem, TextType, ProfanityAction, ProfanityMarker

# ProxyObjects to account, database and container respectively.
# API reference here
MyCosmos = CosmosClient.from_connection_string(os.environ['AzureCosmosDBConnectionString'])
QuipLashDBProxy = MyCosmos.get_database_client(os.environ['Database'])
PlayerContainerProxy = QuipLashDBProxy.get_container_client(os.environ['PlayerContainer'])
PromptContainerProxy = QuipLashDBProxy.get_container_client(os.environ['PromptContainer'])
TranslationKey = os.environ["TranslationKey"]
TranslationEndpoint = os.environ["TranslationEndpoint"]


def main(req: HttpRequest) -> HttpResponse:
    req_data = req.get_json()
    input = json.loads(req_data)
    n = input.get("top")
    logging.info("Buckle Up, we received a request to get the top {} players".format(n))

    # Query to get the top n players
    query = "SELECT VALUE {{username: p.username,games_played: p.games_played,total_score: p.total_score}} FROM player p ORDER BY p.total_score DESC,p.games_played ASC, p.username ASC OFFSET 0 LIMIT {}".format(n)

    try: 
        # Execute the query
        players = list(PlayerContainerProxy.query_items(
            query=query,
            enable_cross_partition_query=True
        ))

        # Log the result for debugging purposes
        logging.info(f"Leaderboard: {players}")

        # Return the result
        return HttpResponse(
            json.dumps(players),
            mimetype="application/json"
        )

    except CosmosHttpResponseError as e:
        logging.error(f'Cosmos DB response error occurred: {e}')
        return HttpResponse(
            json.dumps({"error": f"Cosmos DB response error occurred: {e}"}),
            mimetype="application/json"
        )
