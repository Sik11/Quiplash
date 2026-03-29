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

MyCosmos = CosmosClient.from_connection_string(os.environ['AzureCosmosDBConnectionString'])
QuipLashDBProxy = MyCosmos.get_database_client(os.environ['Database'])
PlayerContainerProxy = QuipLashDBProxy.get_container_client(os.environ['PlayerContainer'])
PromptContainerProxy = QuipLashDBProxy.get_container_client(os.environ['PromptContainer'])
TranslationKey = os.environ["TranslationKey"]
TranslationEndpoint = os.environ["TranslationEndpoint"]


def main(req: HttpRequest) -> HttpResponse:
    req_data = req.get_json()
    input = json.loads(req_data) 
    logging.info("Buckle Up, we're about to delete a prompt! {}".format(input))
    
    username = input.get("player")
    offensive_word = input.get("word")
    prompts_deleted = 0

    # Check input and construct the query accordingly
    if username:
        # Delete all prompts by a specific user
        query = "SELECT * FROM c WHERE c.username = @username"
        parameters = [{"name": "@username", "value": username}]
    elif offensive_word:
        # Delete all prompts containing the exact offensive word
        query = "SELECT * FROM c WHERE ARRAY_CONTAINS(c.texts, {{'text': @word, 'language': 'en'}}, true)"
        # query_interim = "SELECT p.id,p.username,t.text FROM prompt p JOIN t IN p.texts WHERE t.text LIKE \"% @word %\" OR t.text LIKE \"@word %\" OR t.text LIKE \"% @word\""
        query_interim = "SELECT p.id,p.username,t.text FROM prompt p JOIN t IN p.texts WHERE t.text LIKE '%% idiot %' OR t.text LIKE 'idiot %' OR t.text LIKE '%% idiot'"
 
        parameters_interim = [{"name": "@word", "value": offensive_word}] 
        result = PromptContainerProxy.query_items(query=query_interim, parameters=parameters_interim, enable_cross_partition_query=True)
        offensive_ids = set()
        for item in result:
            if item['id'] not in offensive_ids:
                offensive_ids.add(item['id'])
        query = "SELECT * FROM p"
        parameters = []

    # Execute the query
    for item in PromptContainerProxy.query_items(query=query, parameters=parameters, enable_cross_partition_query=True):
        # For offensive word, ensure it's not a substring
        if offensive_word and item['id'] in offensive_ids:
            # Delete prompt
            try:
                PromptContainerProxy.delete_item(item, partition_key=item['username'])
                prompts_deleted += 1

            except exceptions.CosmosResourceNotFoundError:
                logging.error(f"Prompt not found for deletion: {item['id']}")

            except exceptions.CosmosHttpResponseError as e:
                logging.error(f"Cosmos DB response error occurred during deletion: {e}")
                return func.HttpResponse(
                    json.dumps({"result": False, "msg": "An error occurred during deletion"}),
                    mimetype="application/json"
                )
        
        elif username: 
            # Delete prompt
            try:
                PromptContainerProxy.delete_item(item, partition_key=item['username'])
                prompts_deleted += 1

            except exceptions.CosmosResourceNotFoundError:
                logging.error(f"Prompt not found for deletion: {item['id']}")

            except exceptions.CosmosHttpResponseError as e:
                logging.error(f"Cosmos DB response error occurred during deletion: {e}")
                return func.HttpResponse(
                    json.dumps({"result": False, "msg": "An error occurred during deletion"}),
                    mimetype="application/json"
                )

    # Return successful response
    return HttpResponse(
        json.dumps({"result": True, "msg": f"{prompts_deleted} prompts deleted"}),
        mimetype="application/json"
    )

    