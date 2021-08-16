using System;

namespace Conditionals
{
    class Program
    {
        static void Main(string[] args)
        {
            int idadeJoao = 14;

            bool acompanhado = true;

            string mensagemAdicional;

            if (acompanhado)
            {
                mensagemAdicional = "João está acompanhado";
            }
            else
            {
                mensagemAdicional = "João não está acompanhado";
            }

            if (idadeJoao >= 18 || acompanhado) //check if bool acompanhado is true
            {
                Console.WriteLine("Pode Entrar");
                Console.WriteLine(mensagemAdicional);
            }
            else
            {
                Console.WriteLine("Não Pode Entrar");

            }

            Console.WriteLine("Hello World!");
        }
    }
}
