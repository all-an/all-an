using System;

namespace Conditionals
{
    class Program
    {
        static void Main(string[] args)
        {
            int idadeJoao = 14;
            int quantidadePessoas = 2;


            if (idadeJoao >= 18)
            {
                Console.WriteLine("Pode Entrar");
            }
            else
            {
                if (quantidadePessoas > 1)
                {
                    Console.WriteLine("Está acompanhado pode entrar");
                }
                else
                {
                    Console.WriteLine("Não Pode Entrar");
                }
            }

            Console.WriteLine("Hello World!");
        }
    }
}
