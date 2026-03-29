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
    logging.info("Buckle Up, we received a request to get {}".format(input))
    ps_interim = input.get("players")
    players = players = f"({', '.join(map(repr, ps_interim))})"

    lan = repr(input.get("language"))

    query = "SELECT p.id, p.username, t.text FROM p JOIN t IN p.texts WHERE p.username IN {} AND t.language = {}".format(players,lan)
    # Prepare parameters for the query
    params = []
    # Execute the query
    prompts = []
    try:

        items = list(PromptContainerProxy.query_items(
            query=query,
            enable_cross_partition_query=True
        ))

        for item in items:
            prompts.append({
                "id": item.get("id"),
                "text": item.get("text"),
                "username": item.get("username"),
            })
            
    except CosmosHttpResponseError as e:
        logging.error('Cosmos DB response error occurred: {}'.format(e))
        return HttpResponse(
            json.dumps({"error": "Cosmos DB response error occurred: {}".format(e)}),
            mimetype="application/json"
        )
    
    # Return the result
    return HttpResponse(
        json.dumps(prompts),
        mimetype="application/json"
    )
    

    
